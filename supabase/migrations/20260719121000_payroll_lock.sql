-- Payroll lock: once a payroll row is approved/paid, it must never be
-- silently overwritten by regeneration (manual generatePayroll or the
-- monthly cron). Locked rows are excluded from upserts in application code.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payroll_runs.locked_at IS
  'When set, the row is finalized (approved/paid) and excluded from payroll regeneration.';

CREATE INDEX IF NOT EXISTS payroll_runs_locked_period_idx
  ON public.payroll_runs (period_month)
  WHERE locked_at IS NOT NULL;
