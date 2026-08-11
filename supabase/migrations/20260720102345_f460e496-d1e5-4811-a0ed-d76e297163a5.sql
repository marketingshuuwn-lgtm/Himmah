
-- contracts: structured salary fields
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS salary numeric,
  ADD COLUMN IF NOT EXISTS allowances numeric,
  ADD COLUMN IF NOT EXISTS effective_date date;

-- payroll_runs: locked_by
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS locked_by uuid;

-- attendance_rules: IP restriction fields
ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS network_label text,
  ADD COLUMN IF NOT EXISTS allowed_ip_ranges text[] NOT NULL DEFAULT '{}'::text[];

-- employees.employee_no default via sequence
CREATE SEQUENCE IF NOT EXISTS public.employees_employee_no_seq START 1000;
ALTER TABLE public.employees
  ALTER COLUMN employee_no SET DEFAULT ('EMP-' || nextval('public.employees_employee_no_seq'));

-- attendance_punches table
CREATE TABLE IF NOT EXISTS public.attendance_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in','out')),
  punched_at timestamptz NOT NULL DEFAULT now(),
  adopted boolean NOT NULL DEFAULT false,
  via_override boolean NOT NULL DEFAULT false,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_punches TO authenticated;
GRANT ALL ON public.attendance_punches TO service_role;
ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee reads own punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employee inserts own punches"
ON public.attendance_punches FOR INSERT TO authenticated
WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "HR reads all punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Dept manager reads dept punches"
ON public.attendance_punches FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_employee_time
  ON public.attendance_punches (employee_id, punched_at DESC);
