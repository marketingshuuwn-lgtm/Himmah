
-- 1) attendance_records dept manager UPDATE: add matching WITH CHECK
DROP POLICY IF EXISTS "Dept manager updates team attendance" ON public.attendance_records;
CREATE POLICY "Dept manager updates team attendance"
ON public.attendance_records
FOR UPDATE
USING (
  employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
)
WITH CHECK (
  employee_id IN (
    SELECT e.id FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE d.manager_id = auth.uid()
  )
);

-- 2) permission_requests dept manager UPDATE: restrict updatable columns via trigger
CREATE OR REPLACE FUNCTION public.enforce_permission_dept_manager_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'dept_manager')
     AND NOT public.has_role(auth.uid(), 'hr_admin')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'owner')
  THEN
    IF NEW.employee_id  IS DISTINCT FROM OLD.employee_id
       OR NEW.request_date IS DISTINCT FROM OLD.request_date
       OR NEW.start_time   IS DISTINCT FROM OLD.start_time
       OR NEW.end_time     IS DISTINCT FROM OLD.end_time
       OR NEW.reason       IS DISTINCT FROM OLD.reason
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.created_at   IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Department managers may only review permission requests (status/review fields)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permission_dept_manager_update ON public.permission_requests;
CREATE TRIGGER trg_permission_dept_manager_update
BEFORE UPDATE ON public.permission_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_permission_dept_manager_update();

-- 3) contracts: strengthen employee-signing trigger to explicitly forbid pdf_url change
--    (existing trigger already blocks it; recreate defensively — no-op if unchanged)
CREATE OR REPLACE FUNCTION public.enforce_contract_employee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT e.user_id INTO v_owner FROM public.employees e WHERE e.id = NEW.employee_id;
  IF auth.uid() IS NOT NULL
     AND auth.uid() = v_owner
     AND NOT public.has_role(auth.uid(), 'hr_admin')
  THEN
    IF NEW.title       IS DISTINCT FROM OLD.title
       OR NEW.body        IS DISTINCT FROM OLD.body
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.data        IS DISTINCT FROM OLD.data
       OR NEW.pdf_url     IS DISTINCT FROM OLD.pdf_url
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.sent_at     IS DISTINCT FROM OLD.sent_at
    THEN
      RAISE EXCEPTION 'Employees may not modify contract content or PDF link';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'signed' THEN
      RAISE EXCEPTION 'Employees may only set contract status to signed';
    END IF;
    IF OLD.status <> 'sent' AND NEW.status = 'signed' THEN
      RAISE EXCEPTION 'Only sent contracts can be signed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
