
-- Enum for attendance status
CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'leave');
CREATE TYPE public.verification_method AS ENUM ('manual', 'geo', 'webauthn');

-- Attendance rules (global if department_id NULL, otherwise per department)
CREATE TABLE public.attendance_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID UNIQUE REFERENCES public.departments(id) ON DELETE CASCADE,
  work_start TIME NOT NULL DEFAULT '09:00',
  work_end TIME NOT NULL DEFAULT '17:00',
  late_grace_minutes INT NOT NULL DEFAULT 15,
  absence_deduction NUMERIC NOT NULL DEFAULT 0,
  late_deduction_per_minute NUMERIC NOT NULL DEFAULT 0,
  require_geo BOOLEAN NOT NULL DEFAULT false,
  geo_lat NUMERIC,
  geo_lng NUMERIC,
  geo_radius_m INT NOT NULL DEFAULT 200,
  require_webauthn BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX attendance_rules_global_unique
  ON public.attendance_rules ((department_id IS NULL))
  WHERE department_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_rules TO authenticated;
GRANT ALL ON public.attendance_rules TO service_role;
ALTER TABLE public.attendance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated reads rules" ON public.attendance_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages rules" ON public.attendance_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (has_role(auth.uid(), 'hr_admin'));

CREATE TRIGGER update_attendance_rules_updated_at
  BEFORE UPDATE ON public.attendance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attendance records
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  check_in_lat NUMERIC,
  check_in_lng NUMERIC,
  check_out_lat NUMERIC,
  check_out_lng NUMERIC,
  verification_method public.verification_method NOT NULL DEFAULT 'manual',
  status public.attendance_status NOT NULL DEFAULT 'present',
  late_minutes INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee reads own attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employee inserts own attendance" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employee updates own attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Dept manager reads team attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  ));

CREATE POLICY "Dept manager updates team attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  ));

CREATE POLICY "HR manages all attendance" ON public.attendance_records
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Accountant reads attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'accountant'));

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a global rule
INSERT INTO public.attendance_rules (department_id) VALUES (NULL)
  ON CONFLICT DO NOTHING;
