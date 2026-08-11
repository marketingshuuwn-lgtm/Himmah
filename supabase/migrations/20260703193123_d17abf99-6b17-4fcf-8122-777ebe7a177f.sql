
-- Leave requests: replace over-broad dept_manager read with dept-scoped read
DROP POLICY IF EXISTS "HR/Manager reads all leave" ON public.leave_requests;
CREATE POLICY "HR and accountant read all leave"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'hr_admin')
  OR public.has_role(auth.uid(), 'accountant')
);

CREATE POLICY "Dept manager reads dept leave"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);

-- Scope manager UPDATE similarly
DROP POLICY IF EXISTS "HR/Manager manages leave" ON public.leave_requests;
CREATE POLICY "HR manages leave"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'hr_admin'))
WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Dept manager manages dept leave"
ON public.leave_requests
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);

-- Permission requests: same treatment
DROP POLICY IF EXISTS "HR/Mgr reads all permissions" ON public.permission_requests;
CREATE POLICY "HR and accountant read all permissions"
ON public.permission_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'hr_admin')
  OR public.has_role(auth.uid(), 'accountant')
);

CREATE POLICY "Dept manager reads dept permissions"
ON public.permission_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "HR/Mgr manages permissions" ON public.permission_requests;
CREATE POLICY "HR manages permissions"
ON public.permission_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'hr_admin'))
WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

CREATE POLICY "Dept manager manages dept permissions"
ON public.permission_requests
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'dept_manager')
  AND employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);
