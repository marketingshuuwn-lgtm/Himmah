
-- 1) Revoke EXECUTE on internal trigger/helper functions from public roles
REVOKE EXECUTE ON FUNCTION public.enforce_contract_employee_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_attendance_employee_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluations_set_average() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Queue helpers: service_role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- has_role: keep authenticated (used in RLS via RPC); revoke from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- get_user_roles: keep authenticated only
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;

-- 2) Fix broken storage policy: compare folder of object path to employee.user_id
DROP POLICY IF EXISTS dept_manager_read_selfies ON storage.objects;
CREATE POLICY dept_manager_read_selfies ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE (e.user_id)::text = (storage.foldername(storage.objects.name))[1]
      AND d.manager_id = auth.uid()
  )
);
