CREATE INDEX IF NOT EXISTS idx_attendance_records_work_date
  ON public.attendance_records (work_date);

CREATE INDEX IF NOT EXISTS idx_attendance_records_open_sessions
  ON public.attendance_records (work_date)
  WHERE check_out_at IS NULL AND check_in_at IS NOT NULL;