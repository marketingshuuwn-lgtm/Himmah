-- Punch log: every physical punch attempt is recorded (unlimited presses),
-- with application-enforced 2-minute cooldown between attempts.
-- Adoption semantics:
--   * check-in frame  → all punches are 'in';  the FIRST is adopted
--   * checkout frame  → all punches are 'out'; the LAST  is adopted
-- attendance_records remains the single adopted truth (check_in_at = first
-- adopted 'in', check_out_at = latest adopted 'out').

CREATE TYPE public.punch_kind AS ENUM ('in', 'out');

CREATE TABLE public.attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  kind public.punch_kind NOT NULL,
  punched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  adopted BOOLEAN NOT NULL DEFAULT false,
  lat NUMERIC,
  lng NUMERIC,
  distance_m INTEGER,
  via_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX attendance_punches_emp_date_idx
  ON public.attendance_punches (employee_id, work_date, punched_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.attendance_punches TO authenticated;
GRANT ALL ON public.attendance_punches TO service_role;
ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

-- Employee: full read of own punches; insert own punches.
CREATE POLICY "Employee reads own punches" ON public.attendance_punches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  ));

CREATE POLICY "Employee inserts own punches" ON public.attendance_punches
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  ));

-- Employee may flip adoption on own punches (last-out-wins bookkeeping).
CREATE POLICY "Employee updates own punch adoption" ON public.attendance_punches
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  ));

-- HR admin: read everything for audit/reporting.
CREATE POLICY "HR reads all punches" ON public.attendance_punches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'));

-- Dept managers: read their team's punches (for the punch-location view).
CREATE POLICY "Dept manager reads team punches" ON public.attendance_punches
  FOR SELECT TO authenticated
  USING (employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  ));
