REVOKE ALL ON FUNCTION public.approve_leave_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recalc_leave_balance(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_leave_balance(uuid, uuid, integer) TO service_role;