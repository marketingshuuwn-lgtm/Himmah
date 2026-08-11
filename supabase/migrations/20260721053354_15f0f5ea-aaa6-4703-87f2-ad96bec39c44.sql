
DROP POLICY IF EXISTS "Dept manager updates team attendance" ON public.attendance_records;
CREATE POLICY "Dept manager updates team attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (employee_id IN (SELECT e.id FROM employees e JOIN departments d ON d.id = e.department_id WHERE d.manager_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT e.id FROM employees e JOIN departments d ON d.id = e.department_id WHERE d.manager_id = auth.uid()));

DROP POLICY IF EXISTS "authenticated read org_settings" ON public.org_settings;
CREATE POLICY "privileged read org_settings" ON public.org_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'accountant'));
