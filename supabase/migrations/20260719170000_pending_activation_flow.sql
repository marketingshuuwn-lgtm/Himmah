-- Pending-activation flow: when a new account signs up, HR admins and
-- owners/admins get an immediate in-app notification, and the account
-- appears in the "بانتظار التفعيل" list until it is linked to an employee
-- record and department.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_count INT;
  v_name TEXT;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, v_name);

  SELECT COUNT(*) INTO v_user_count FROM public.user_roles;

  IF v_user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'hr_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');

    -- Notify every HR admin / owner / admin: a new account awaits activation.
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT ur.user_id,
           'info'::public.notification_kind,
           'حساب جديد بانتظار التفعيل',
           'سجّل ' || v_name || ' حساباً جديداً — فعّله واربطه بقسمه من صفحة الموظفين.',
           '/employees'
    FROM public.user_roles ur
    WHERE ur.role IN ('hr_admin', 'owner', 'admin');
  END IF;

  RETURN NEW;
END;
$$;
