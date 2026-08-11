
REVOKE ALL ON FUNCTION public.prevent_owner_role_removal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_owner_role_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_owner_profile_delete() FROM PUBLIC, anon, authenticated;
