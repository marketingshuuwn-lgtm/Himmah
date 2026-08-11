
CREATE OR REPLACE FUNCTION public.contract_selfsign_fields_unchanged(
  _id uuid, _template_id uuid, _employee_id uuid, _title text, _body text,
  _data jsonb, _pdf_url text, _salary numeric, _allowances numeric,
  _effective_date date, _sent_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = _id
      AND c.status = 'sent'
      AND c.template_id IS NOT DISTINCT FROM _template_id
      AND c.employee_id IS NOT DISTINCT FROM _employee_id
      AND c.title IS NOT DISTINCT FROM _title
      AND c.body IS NOT DISTINCT FROM _body
      AND c.data IS NOT DISTINCT FROM _data
      AND c.pdf_url IS NOT DISTINCT FROM _pdf_url
      AND c.salary IS NOT DISTINCT FROM _salary
      AND c.allowances IS NOT DISTINCT FROM _allowances
      AND c.effective_date IS NOT DISTINCT FROM _effective_date
      AND c.sent_at IS NOT DISTINCT FROM _sent_at
  );
$$;

REVOKE ALL ON FUNCTION public.contract_selfsign_fields_unchanged(uuid,uuid,uuid,text,text,jsonb,text,numeric,numeric,date,timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contract_selfsign_fields_unchanged(uuid,uuid,uuid,text,text,jsonb,text,numeric,numeric,date,timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "Employee signs own contracts" ON public.contracts;
CREATE POLICY "Employee signs own contracts"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  status = 'sent'
  AND employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid())
)
WITH CHECK (
  status = 'signed'
  AND employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid())
  AND public.contract_selfsign_fields_unchanged(
        id, template_id, employee_id, title, body, data, pdf_url,
        salary, allowances, effective_date, sent_at)
);

DROP POLICY IF EXISTS "Signer inserts own signature" ON public.signatures;
CREATE POLICY "Signer inserts own signature"
ON public.signatures
FOR INSERT
TO authenticated
WITH CHECK (
  signer_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.employees e ON e.id = c.employee_id
    WHERE c.id = signatures.contract_id
      AND e.user_id = auth.uid()
      AND c.status = 'sent'
  )
);
