-- P0: Allow authenticated users to insert audit entries about their own actions
CREATE POLICY "Authenticated can log own actions" ON public.security_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- Also allow service_role/system inserts (triggers already use SECURITY DEFINER)
CREATE POLICY "Service role can log any action" ON public.security_audit_log
  FOR INSERT TO service_role
  WITH CHECK (true);

-- P1: Hot-path index for attendance lookups
CREATE INDEX IF NOT EXISTS idx_attendance_records_emp_date
  ON public.attendance_records (employee_id, work_date);
