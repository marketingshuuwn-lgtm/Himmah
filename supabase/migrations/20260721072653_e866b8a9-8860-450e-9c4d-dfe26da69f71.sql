
-- Add missing attendance_rules column
ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS absence_calc_mode text NOT NULL DEFAULT 'salary_per_30'
    CHECK (absence_calc_mode IN ('salary_per_30','fixed_amount'));

-- Add payroll_runs approval workflow columns
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','pending_admin_approval','sent_to_employee','employee_approved','employee_objected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS employee_decided_at timestamptz;

-- Create payroll_settings (singleton)
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  auto_generate_day int NOT NULL DEFAULT 25 CHECK (auto_generate_day BETWEEN 1 AND 28),
  auto_request_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payroll_settings TO authenticated;
GRANT ALL ON public.payroll_settings TO service_role;

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged read payroll_settings" ON public.payroll_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "HR manages payroll_settings" ON public.payroll_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin')
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payroll_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
