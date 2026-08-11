-- Add SIF/banking fields to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank_name text;

-- Organization settings (single-row) for WPS/SIF
CREATE TABLE IF NOT EXISTS public.org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_name text NOT NULL DEFAULT '',
  employer_id text NOT NULL DEFAULT '',
  bank_code text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  iban text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read org_settings" ON public.org_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "hr_admin manage org_settings" ON public.org_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER update_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a single settings row if none exists
INSERT INTO public.org_settings (establishment_name)
  SELECT '' WHERE NOT EXISTS (SELECT 1 FROM public.org_settings);