
DROP POLICY IF EXISTS "Employee signs own contracts" ON public.contracts;

CREATE POLICY "Employee signs own contracts"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'sent'
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'signed'
);
