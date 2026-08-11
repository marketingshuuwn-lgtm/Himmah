
DROP POLICY IF EXISTS "Authenticated inserts audit" ON public.contract_audit_log;
CREATE POLICY "Auth users insert own audit"
  ON public.contract_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;
