
-- Enforce signature ownership: signer must own the contract (via employee)
-- and contract must be in 'sent' status.
CREATE OR REPLACE FUNCTION public.enforce_signature_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_user uuid;
  v_status contract_status;
BEGIN
  IF NEW.signer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'signer_id must equal auth.uid()';
  END IF;
  SELECT e.user_id, c.status
    INTO v_owner_user, v_status
  FROM public.contracts c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE c.id = NEW.contract_id;
  IF v_owner_user IS NULL THEN
    RAISE EXCEPTION 'contract not found';
  END IF;
  IF v_owner_user <> auth.uid() THEN
    RAISE EXCEPTION 'You can only sign your own contracts';
  END IF;
  IF v_status <> 'sent' THEN
    RAISE EXCEPTION 'Contract is not in sent status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_signature_ownership ON public.signatures;
CREATE TRIGGER trg_enforce_signature_ownership
BEFORE INSERT ON public.signatures
FOR EACH ROW EXECUTE FUNCTION public.enforce_signature_ownership();

-- Tighten contracts employee UPDATE policy: explicit WITH CHECK ensuring
-- only signing transition and no other column tampering (defense-in-depth
-- alongside enforce_contract_employee_update trigger which locks columns).
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
  AND pdf_url IS NOT DISTINCT FROM (SELECT pdf_url FROM public.contracts WHERE id = contracts.id)
  AND body    IS NOT DISTINCT FROM (SELECT body    FROM public.contracts WHERE id = contracts.id)
  AND title   IS NOT DISTINCT FROM (SELECT title   FROM public.contracts WHERE id = contracts.id)
  AND data    IS NOT DISTINCT FROM (SELECT data    FROM public.contracts WHERE id = contracts.id)
  AND template_id IS NOT DISTINCT FROM (SELECT template_id FROM public.contracts WHERE id = contracts.id)
  AND employee_id IS NOT DISTINCT FROM (SELECT employee_id FROM public.contracts WHERE id = contracts.id)
);
