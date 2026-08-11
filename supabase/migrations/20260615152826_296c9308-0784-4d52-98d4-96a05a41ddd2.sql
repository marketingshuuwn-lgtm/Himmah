
ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS flex_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_window_start time,
  ADD COLUMN IF NOT EXISTS late_window_end time,
  ADD COLUMN IF NOT EXISTS half_day_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tiered_late_deduction jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS late_deduction_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.attendance_audit_log TO authenticated;
GRANT ALL ON public.attendance_audit_log TO service_role;

ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR admins can view audit log" ON public.attendance_audit_log;
CREATE POLICY "HR admins can view audit log"
  ON public.attendance_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'));

DROP POLICY IF EXISTS "HR admins can insert audit log" ON public.attendance_audit_log;
CREATE POLICY "HR admins can insert audit log"
  ON public.attendance_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin') AND edited_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_attendance_audit_record ON public.attendance_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_created ON public.attendance_audit_log(created_at DESC);

UPDATE public.attendance_rules
SET tiered_late_deduction = '[
  {"from":1,"to":15,"rate":0},
  {"from":16,"to":30,"rate":1.0},
  {"from":31,"to":60,"rate":2.0},
  {"from":61,"to":9999,"rate":3.0}
]'::jsonb
WHERE department_id IS NULL AND (tiered_late_deduction IS NULL OR tiered_late_deduction = '[]'::jsonb);
