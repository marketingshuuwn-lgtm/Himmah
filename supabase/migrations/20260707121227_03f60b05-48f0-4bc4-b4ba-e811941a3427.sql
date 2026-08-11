
-- 1) Extend payroll_runs
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS pay_date date,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS payslip_pdf_url text;

-- 2) Payroll disputes table
CREATE TABLE IF NOT EXISTS public.payroll_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  hr_response text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payroll_disputes TO authenticated;
GRANT ALL ON public.payroll_disputes TO service_role;

ALTER TABLE public.payroll_disputes ENABLE ROW LEVEL SECURITY;

-- Employees: read own disputes
CREATE POLICY "Employees read own payroll disputes"
  ON public.payroll_disputes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_disputes.employee_id AND e.user_id = auth.uid()
    )
  );

-- Employees: open dispute on own payslip
CREATE POLICY "Employees open own payroll dispute"
  ON public.payroll_disputes FOR INSERT
  TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = payroll_disputes.employee_id AND e.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.payroll_runs r
      WHERE r.id = payroll_disputes.payroll_run_id AND r.employee_id = payroll_disputes.employee_id
    )
  );

-- HR + Accountant: full read
CREATE POLICY "HR read all payroll disputes"
  ON public.payroll_disputes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

-- HR + Accountant: update (respond)
CREATE POLICY "HR respond to payroll disputes"
  ON public.payroll_disputes FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_payroll_disputes_updated ON public.payroll_disputes;
CREATE TRIGGER trg_payroll_disputes_updated
  BEFORE UPDATE ON public.payroll_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payroll_disputes_run ON public.payroll_disputes(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_disputes_emp ON public.payroll_disputes(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_disputes_status ON public.payroll_disputes(status);
