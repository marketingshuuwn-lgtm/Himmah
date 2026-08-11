
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_user_id uuid,
  actor_kind text NOT NULL DEFAULT 'user',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_admin')
  );

CREATE INDEX IF NOT EXISTS security_audit_log_entity_idx
  ON public.security_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS security_audit_log_created_idx
  ON public.security_audit_log(created_at DESC);

-- Trigger: capture every leave_requests status change.
CREATE OR REPLACE FUNCTION public.audit_leave_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.security_audit_log(entity_type, entity_id, action, actor_user_id, actor_kind, metadata)
    VALUES (
      'leave_request',
      NEW.id,
      'status_change',
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'employee_id', NEW.employee_id,
        'reviewed_by', NEW.reviewed_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_leave_status_change_trg ON public.leave_requests;
CREATE TRIGGER audit_leave_status_change_trg
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_leave_status_change();

-- Same for permission_requests.
CREATE OR REPLACE FUNCTION public.audit_permission_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.security_audit_log(entity_type, entity_id, action, actor_user_id, actor_kind, metadata)
    VALUES (
      'permission_request',
      NEW.id,
      'status_change',
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'employee_id', NEW.employee_id,
        'reviewed_by', NEW.reviewed_by
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_permission_status_change_trg ON public.permission_requests;
CREATE TRIGGER audit_permission_status_change_trg
  AFTER UPDATE ON public.permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_permission_status_change();

-- Server-side helper to enforce that only HR/dept-manager/owner/admin roles can approve/reject.
CREATE OR REPLACE FUNCTION public.can_review_requests(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','admin','hr_admin','dept_manager')
  );
$$;
