
-- Fix contracts UPDATE WITH CHECK: previous self-referential subquery (id=id) was a tautology.
-- Column-pinning is already enforced by trigger enforce_contract_employee_update; simplify the policy.
DROP POLICY IF EXISTS "Employee signs own contracts" ON public.contracts;
CREATE POLICY "Employee signs own contracts"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'sent'::contract_status
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND status = 'signed'::contract_status
);

-- Add explicit WITH CHECK to profiles self-update to prevent future scope drift.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
