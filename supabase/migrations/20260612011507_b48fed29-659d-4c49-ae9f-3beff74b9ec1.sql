
CREATE POLICY "HR full access contracts bucket"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'contracts' AND public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (bucket_id = 'contracts' AND public.has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Employees read own contract files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      JOIN public.employees e ON e.id = c.employee_id
      WHERE e.user_id = auth.uid()
      AND (storage.foldername(name))[1] = c.id::text
    )
  );
