DROP POLICY IF EXISTS "Authenticated reads rules" ON public.attendance_rules;
CREATE POLICY "Management reads rules" ON public.attendance_rules
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dept_manager')
    OR public.has_role(auth.uid(), 'accountant')
  );