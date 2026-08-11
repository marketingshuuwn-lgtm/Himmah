
CREATE TABLE IF NOT EXISTS public.payroll_generation_locks (
  period_month date PRIMARY KEY,
  locked_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.payroll_generation_locks TO authenticated;
GRANT ALL ON public.payroll_generation_locks TO service_role;

ALTER TABLE public.payroll_generation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_and_accountant_manage_payroll_locks"
ON public.payroll_generation_locks
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'accountant') OR public.has_role(auth.uid(), 'owner'));
