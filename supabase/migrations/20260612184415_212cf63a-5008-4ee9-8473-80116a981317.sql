
-- 1) Attendance: lock immutable fields when employee updates their own record
CREATE OR REPLACE FUNCTION public.enforce_attendance_employee_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.employees WHERE id = NEW.employee_id;

  -- Only enforce for the employee acting on their own record.
  -- HR/dept managers go through other policies; allow their changes.
  IF auth.uid() IS NOT NULL
     AND auth.uid() = v_owner
     AND NOT public.has_role(auth.uid(), 'hr_admin')
     AND NOT public.has_role(auth.uid(), 'dept_manager')
     AND NOT public.has_role(auth.uid(), 'accountant')
  THEN
    IF NEW.employee_id     IS DISTINCT FROM OLD.employee_id
       OR NEW.work_date    IS DISTINCT FROM OLD.work_date
       OR NEW.check_in_at  IS DISTINCT FROM OLD.check_in_at
       OR NEW.check_in_lat IS DISTINCT FROM OLD.check_in_lat
       OR NEW.check_in_lng IS DISTINCT FROM OLD.check_in_lng
       OR NEW.status       IS DISTINCT FROM OLD.status
       OR NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
       OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
    THEN
      RAISE EXCEPTION 'Employees may only update check-out fields on their attendance';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attendance_employee_update_trg ON public.attendance_records;
CREATE TRIGGER enforce_attendance_employee_update_trg
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_employee_update();

-- 2) Contract audit log: require contract_id to belong to caller (employee or HR/dept manager)
DROP POLICY IF EXISTS "Auth users insert own audit" ON public.contract_audit_log;
DROP POLICY IF EXISTS "Authenticated inserts audit" ON public.contract_audit_log;

CREATE POLICY "Insert audit only for permitted contracts"
  ON public.contract_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'hr_admin')
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        LEFT JOIN public.employees e ON e.id = c.employee_id
        WHERE c.id = contract_audit_log.contract_id
          AND (
            e.user_id = auth.uid()
            OR c.created_by = auth.uid()
            OR (
              public.has_role(auth.uid(), 'dept_manager')
              AND EXISTS (
                SELECT 1 FROM public.departments d
                WHERE d.id = e.department_id AND d.manager_id = auth.uid()
              )
            )
          )
      )
    )
  );

-- 3) Storage: allow employees + dept managers to upload their own contract PDFs
DROP POLICY IF EXISTS "Employee uploads own contract pdf" ON storage.objects;
CREATE POLICY "Employee uploads own contract pdf"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.employees e ON e.id = c.employee_id
      WHERE (storage.foldername(name))[1] = c.id::text
        AND (
          e.user_id = auth.uid()
          OR c.created_by = auth.uid()
          OR (
            public.has_role(auth.uid(), 'dept_manager')
            AND EXISTS (
              SELECT 1 FROM public.departments d
              WHERE d.id = e.department_id AND d.manager_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Employee updates own contract pdf" ON storage.objects;
CREATE POLICY "Employee updates own contract pdf"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.employees e ON e.id = c.employee_id
      WHERE (storage.foldername(name))[1] = c.id::text
        AND (
          e.user_id = auth.uid()
          OR c.created_by = auth.uid()
          OR (
            public.has_role(auth.uid(), 'dept_manager')
            AND EXISTS (
              SELECT 1 FROM public.departments d
              WHERE d.id = e.department_id AND d.manager_id = auth.uid()
            )
          )
        )
    )
  );
