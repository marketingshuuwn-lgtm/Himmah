-- Backfill: mark all historically approved leave days as excused attendance
-- records (status = 'leave'), so payroll regeneration of past months never
-- counts approved leave as absence.
--
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING against UNIQUE(employee_id, work_date).
-- Insert-only — never updates or deletes existing records.
-- Excludes Fri/Sat to mirror application logic (weekends are not working days).
-- Range guarded to 366 days per request as a safety bound.

INSERT INTO public.attendance_records
  (employee_id, work_date, status, verification_method, notes)
SELECT
  lr.employee_id,
  d.day::date AS work_date,
  'leave'::public.attendance_status,
  'manual'::public.verification_method,
  'leave_auto:' || lr.id
FROM public.leave_requests lr
CROSS JOIN LATERAL generate_series(
  lr.start_date::timestamp,
  LEAST(lr.end_date, lr.start_date + INTERVAL '366 days')::timestamp,
  INTERVAL '1 day'
) AS d(day)
WHERE lr.status = 'approved'
  AND EXTRACT(DOW FROM d.day) NOT IN (5, 6)
ON CONFLICT (employee_id, work_date) DO NOTHING;
