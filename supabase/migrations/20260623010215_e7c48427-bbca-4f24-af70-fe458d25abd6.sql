
-- Employees upload/read/delete their own selfies in attendance-selfies bucket.
-- Path convention: <user_id>/<work_date>/<filename>
CREATE POLICY "employee_select_own_selfies"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "employee_insert_own_selfies"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attendance-selfies'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "employee_delete_own_selfies"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "hr_all_selfies"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND public.has_role(auth.uid(), 'hr_admin')
)
WITH CHECK (
  bucket_id = 'attendance-selfies'
  AND public.has_role(auth.uid(), 'hr_admin')
);

CREATE POLICY "dept_manager_read_selfies"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-selfies'
  AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.user_id::text = (storage.foldername(name))[1]
      AND d.manager_id = auth.uid()
  )
);
