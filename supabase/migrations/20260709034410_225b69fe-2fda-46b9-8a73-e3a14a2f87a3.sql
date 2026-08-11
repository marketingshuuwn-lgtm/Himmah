
-- Strict trigger: employees can only edit non-status fields of THEIR OWN pending permission requests.
-- HR/dept-manager/admin/owner still go through normal RLS + reviewPermission fn.
CREATE OR REPLACE FUNCTION public.enforce_permission_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT e.user_id INTO v_owner FROM public.employees e WHERE e.id = NEW.employee_id;

  IF auth.uid() IS NOT NULL
     AND auth.uid() = v_owner
     AND NOT public.has_role(auth.uid(), 'hr_admin')
     AND NOT public.has_role(auth.uid(), 'dept_manager')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'owner')
  THEN
    -- Employees may only transition status to 'cancelled' (from pending)
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Employees may only cancel their own pending permission requests';
    END IF;
    -- Cannot change core fields once submitted
    IF NEW.employee_id  IS DISTINCT FROM OLD.employee_id
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note
    THEN
      RAISE EXCEPTION 'Employees may not modify review fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_permission_employee_update ON public.permission_requests;
CREATE TRIGGER trg_enforce_permission_employee_update
  BEFORE UPDATE ON public.permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_permission_employee_update();

-- Same for leave_requests: employees can only cancel their own pending requests.
CREATE OR REPLACE FUNCTION public.enforce_leave_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT e.user_id INTO v_owner FROM public.employees e WHERE e.id = NEW.employee_id;

  IF auth.uid() IS NOT NULL
     AND auth.uid() = v_owner
     AND NOT public.has_role(auth.uid(), 'hr_admin')
     AND NOT public.has_role(auth.uid(), 'dept_manager')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'owner')
  THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Employees may only cancel their own pending leave requests';
    END IF;
    IF NEW.employee_id  IS DISTINCT FROM OLD.employee_id
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note
    THEN
      RAISE EXCEPTION 'Employees may not modify review fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_leave_employee_update ON public.leave_requests;
CREATE TRIGGER trg_enforce_leave_employee_update
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_employee_update();

-- Helper for department manager: get department_id of the manager's own employee record.
CREATE OR REPLACE FUNCTION public.manager_department_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.employees WHERE user_id = _user_id LIMIT 1;
$$;
