CREATE TABLE public.role_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (capability, role)
);

GRANT SELECT ON public.role_capabilities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_capabilities TO authenticated;
GRANT ALL ON public.role_capabilities TO service_role;

ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read capabilities"
ON public.role_capabilities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner or admin can insert capabilities"
ON public.role_capabilities FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can update capabilities"
ON public.role_capabilities FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can delete capabilities"
ON public.role_capabilities FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('owner','admin')
  ) OR EXISTS (
    SELECT 1
    FROM public.role_capabilities rc
    JOIN public.user_roles ur ON ur.role = rc.role
    WHERE ur.user_id = _user_id AND rc.capability = _capability
  );
$$;

INSERT INTO public.role_capabilities (capability, role) VALUES
  ('attendance_edit', 'hr_admin'),
  ('attendance_correction_review', 'hr_admin'),
  ('leave_review', 'hr_admin'),
  ('leave_review', 'dept_manager'),
  ('payroll_generate', 'hr_admin'),
  ('payroll_generate', 'accountant')
ON CONFLICT DO NOTHING;