-- 1) Explicit kind on permission_requests
DO $$ BEGIN
  CREATE TYPE public.permission_kind AS ENUM ('permission', 'attendance_correction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.permission_requests
  ADD COLUMN IF NOT EXISTS kind public.permission_kind NOT NULL DEFAULT 'permission';

UPDATE public.permission_requests
   SET kind = 'attendance_correction'
 WHERE reason ILIKE '[attendance_correction%'
   AND kind <> 'attendance_correction';

CREATE UNIQUE INDEX IF NOT EXISTS permission_requests_pending_correction_uniq
  ON public.permission_requests (employee_id, request_date)
  WHERE kind = 'attendance_correction' AND status = 'pending';

CREATE INDEX IF NOT EXISTS permission_requests_kind_status_idx
  ON public.permission_requests (kind, status, request_date DESC);

-- Keep kind in sync for rows inserted by older code paths (reason prefix).
CREATE OR REPLACE FUNCTION public.sync_permission_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reason ILIKE '[attendance_correction%' THEN
    NEW.kind := 'attendance_correction';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_permission_kind ON public.permission_requests;
CREATE TRIGGER trg_sync_permission_kind
  BEFORE INSERT OR UPDATE OF reason ON public.permission_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_permission_kind();

-- 2) Atomic cancellation of an APPROVED leave request (management only)
CREATE OR REPLACE FUNCTION public.cancel_approved_leave(_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.leave_requests%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO r FROM public.leave_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;
  IF r.status <> 'approved' THEN
    RAISE EXCEPTION 'هذا الإجراء مخصص للإجازات المعتمدة فقط';
  END IF;

  -- Roll back the leave-day attendance marking created at approval time.
  DELETE FROM public.attendance_records
   WHERE employee_id = r.employee_id
     AND work_date BETWEEN r.start_date AND r.end_date
     AND status = 'leave'
     AND check_in_at IS NULL;

  UPDATE public.leave_requests
     SET status = 'cancelled',
         review_note = COALESCE(_note, review_note),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_approved_leave(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_approved_leave(uuid, text) TO authenticated;