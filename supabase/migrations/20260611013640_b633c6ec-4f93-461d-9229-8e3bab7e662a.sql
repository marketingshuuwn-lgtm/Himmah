
-- Bonuses
CREATE TABLE public.bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL DEFAULT '',
  period_month date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;
GRANT ALL ON public.bonuses TO service_role;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR & accountant manage bonuses" ON public.bonuses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "Dept manager sees dept bonuses" ON public.bonuses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = bonuses.employee_id AND d.manager_id = auth.uid()
  ));

CREATE POLICY "Employee sees own bonuses" ON public.bonuses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.user_id = auth.uid()));

CREATE TRIGGER bonuses_set_updated_at BEFORE UPDATE ON public.bonuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deductions
CREATE TABLE public.deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL DEFAULT '',
  period_month date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT ALL ON public.deductions TO service_role;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR & accountant manage deductions" ON public.deductions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "Dept manager sees dept deductions" ON public.deductions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = deductions.employee_id AND d.manager_id = auth.uid()
  ));

CREATE POLICY "Employee sees own deductions" ON public.deductions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.user_id = auth.uid()));

CREATE TRIGGER deductions_set_updated_at BEFORE UPDATE ON public.deductions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payroll runs
CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  base_salary numeric(12,2) NOT NULL DEFAULT 0,
  allowances numeric(12,2) NOT NULL DEFAULT 0,
  bonuses_total numeric(12,2) NOT NULL DEFAULT 0,
  deductions_total numeric(12,2) NOT NULL DEFAULT 0,
  absence_days integer NOT NULL DEFAULT 0,
  absence_deduction numeric(12,2) NOT NULL DEFAULT 0,
  late_minutes integer NOT NULL DEFAULT 0,
  late_deduction numeric(12,2) NOT NULL DEFAULT 0,
  net_salary numeric(12,2) NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR & accountant manage payroll" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'hr_admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "Dept manager sees dept payroll" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = payroll_runs.employee_id AND d.manager_id = auth.uid()
  ));

CREATE POLICY "Employee sees own payroll" ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payroll_runs.employee_id AND e.user_id = auth.uid()));

CREATE TRIGGER payroll_runs_set_updated_at BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX bonuses_emp_month_idx ON public.bonuses(employee_id, period_month);
CREATE INDEX deductions_emp_month_idx ON public.deductions(employee_id, period_month);
CREATE INDEX payroll_emp_month_idx ON public.payroll_runs(employee_id, period_month);
