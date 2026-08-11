
DROP POLICY IF EXISTS "Employee cancels own pending" ON public.leave_requests;
CREATE POLICY "Employee cancels own pending"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status IN ('draft','pending')
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'cancelled'
  );

DROP POLICY IF EXISTS "Employee cancels own pending permission" ON public.permission_requests;
CREATE POLICY "Employee cancels own pending permission"
  ON public.permission_requests FOR UPDATE TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND status = 'cancelled'
  );
