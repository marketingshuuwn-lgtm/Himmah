
-- Contract templates
CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages templates" ON public.contract_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));
CREATE POLICY "All authenticated can read templates" ON public.contract_templates FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TRIGGER trg_ct_updated BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contracts
CREATE TYPE public.contract_status AS ENUM ('draft','sent','signed','cancelled');

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.contract_status NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR manages all contracts" ON public.contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Employee sees own contracts" ON public.contracts FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employee signs own contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Dept manager reads dept contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'dept_manager') AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  ));

CREATE TRIGGER trg_c_updated BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Signatures
CREATE TABLE public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_image TEXT NOT NULL,
  webauthn_verified BOOLEAN NOT NULL DEFAULT false,
  webauthn_credential_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.signatures TO authenticated;
GRANT ALL ON public.signatures TO service_role;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR reads all signatures" ON public.signatures FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'));
CREATE POLICY "Signer reads own signatures" ON public.signatures FOR SELECT TO authenticated
  USING (signer_id = auth.uid());
CREATE POLICY "Signer inserts own signature" ON public.signatures FOR INSERT TO authenticated
  WITH CHECK (signer_id = auth.uid());

-- WebAuthn credentials
CREATE TABLE public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own credentials" ON public.webauthn_credentials FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Audit log
CREATE TABLE public.contract_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.contract_audit_log TO authenticated;
GRANT ALL ON public.contract_audit_log TO service_role;
ALTER TABLE public.contract_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR reads all audit" ON public.contract_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'));
CREATE POLICY "Employee reads own contract audit" ON public.contract_audit_log FOR SELECT TO authenticated
  USING (contract_id IN (
    SELECT c.id FROM public.contracts c
    JOIN public.employees e ON e.id = c.employee_id
    WHERE e.user_id = auth.uid()
  ));
CREATE POLICY "Authenticated inserts audit" ON public.contract_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);
