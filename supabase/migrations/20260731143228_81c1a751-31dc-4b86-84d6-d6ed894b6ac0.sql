ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS early_leave_deduction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_leave_grace_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_leave_deduction_per_minute numeric NOT NULL DEFAULT 0;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS early_leave_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_leave_deduction_amount numeric NOT NULL DEFAULT 0;