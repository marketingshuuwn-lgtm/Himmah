-- File attachment support for leave and permission requests (e.g. a
-- medical certificate for sick leave, or supporting evidence for a
-- permission request). Storage path only; the actual file lives in the
-- existing "documents" bucket under a request-attachments/ prefix.

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS attachment_path TEXT;

ALTER TABLE public.permission_requests
  ADD COLUMN IF NOT EXISTS attachment_path TEXT;

COMMENT ON COLUMN public.leave_requests.attachment_path IS
  'Storage path in the documents bucket for a supporting file (e.g. medical certificate).';
COMMENT ON COLUMN public.permission_requests.attachment_path IS
  'Storage path in the documents bucket for a supporting file.';

-- The existing documents_select_own storage policy only allowed hr_admin
-- or the uploader themselves — a dept_manager reviewing their own team's
-- leave/permission request would be blocked from viewing the attached
-- file. Extend read access to a manager's own team.
DROP POLICY IF EXISTS "documents_select_own" ON storage.objects;
CREATE POLICY "documents_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.user_id::text = (storage.foldername(name))[1]
          AND e.department_id = public.manager_department_id(auth.uid())
      )
    )
  );

