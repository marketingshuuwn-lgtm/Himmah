
-- 1) Seed current sole hr_admin (if any) as owner, else first user
DO $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    SELECT user_id INTO v_owner_id
      FROM public.user_roles
      WHERE role = 'hr_admin'
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1;
    IF v_owner_id IS NULL THEN
      SELECT id INTO v_owner_id FROM public.profiles ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_owner_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
        VALUES (v_owner_id, 'owner')
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- 2) Trigger: prevent removing the owner role row (except via new_owner transfer done in a fn)
CREATE OR REPLACE FUNCTION public.prevent_owner_role_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner' THEN
    -- Allow only if another owner exists (transfer of ownership scenario)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE role = 'owner' AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION 'لا يمكن إزالة دور المالك من هذا الحساب';
    END IF;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_owner_role_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_owner_role_removal
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_role_removal();

-- 3) Trigger: only current owner may INSERT the 'owner' role (transfer)
CREATE OR REPLACE FUNCTION public.enforce_owner_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    -- Allow if no owner exists yet (bootstrap/seed)
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
      RETURN NEW;
    END IF;
    -- Otherwise caller must be an existing owner (auth.uid() may be null for server ops using service role – bypassed by SECURITY DEFINER)
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE role = 'owner' AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'دور المالك يمنحه المالك الحالي فقط';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_owner_role_assignment ON public.user_roles;
CREATE TRIGGER trg_enforce_owner_role_assignment
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_role_assignment();

-- 4) Trigger: prevent deleting the owner's profile row
CREATE OR REPLACE FUNCTION public.prevent_owner_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'owner') THEN
    RAISE EXCEPTION 'لا يمكن حذف حساب مالك النظام';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_owner_profile_delete ON public.profiles;
CREATE TRIGGER trg_prevent_owner_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_profile_delete();

-- 5) Update handle_new_user: first user becomes owner+hr_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  SELECT COUNT(*) INTO v_user_count FROM public.user_roles;

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'hr_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

  RETURN NEW;
END $$;
