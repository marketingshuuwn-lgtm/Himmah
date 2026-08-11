-- ============ 1) leave_balances integrity + auto used_days ============
DELETE FROM public.leave_balances a
USING public.leave_balances b
WHERE a.ctid < b.ctid
  AND a.employee_id = b.employee_id
  AND a.leave_type_id = b.leave_type_id
  AND a.year = b.year;

ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_emp_type_year_key UNIQUE (employee_id, leave_type_id, year);

CREATE OR REPLACE FUNCTION public.recalc_leave_balance(_employee_id uuid, _leave_type_id uuid, _year integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used numeric;
  v_default numeric;
BEGIN
  IF _employee_id IS NULL OR _leave_type_id IS NULL OR _year IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(days), 0) INTO v_used
  FROM public.leave_requests
  WHERE employee_id = _employee_id
    AND leave_type_id = _leave_type_id
    AND status = 'approved'
    AND EXTRACT(YEAR FROM start_date)::int = _year;

  SELECT COALESCE(default_annual_days, 0) INTO v_default
  FROM public.leave_types WHERE id = _leave_type_id;

  INSERT INTO public.leave_balances (employee_id, leave_type_id, year, entitled_days, used_days)
  VALUES (_employee_id, _leave_type_id, _year, COALESCE(v_default, 0), v_used)
  ON CONFLICT (employee_id, leave_type_id, year)
  DO UPDATE SET used_days = EXCLUDED.used_days, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_leave_balance_on_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.recalc_leave_balance(OLD.employee_id, OLD.leave_type_id, EXTRACT(YEAR FROM OLD.start_date)::int);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.recalc_leave_balance(NEW.employee_id, NEW.leave_type_id, EXTRACT(YEAR FROM NEW.start_date)::int);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leave_balance ON public.leave_requests;
CREATE TRIGGER trg_sync_leave_balance
AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_leave_balance_on_request();

-- backfill existing balances
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT employee_id, leave_type_id, EXTRACT(YEAR FROM start_date)::int AS y
    FROM public.leave_requests WHERE status = 'approved'
  LOOP
    PERFORM public.recalc_leave_balance(r.employee_id, r.leave_type_id, r.y);
  END LOOP;
END $$;

-- ============ 2) Atomic leave approval (status + attendance marking) ============
CREATE OR REPLACE FUNCTION public.approve_leave_request(_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.leave_requests%ROWTYPE;
  v_marked int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_review_requests(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role to review leave requests';
  END IF;

  SELECT * INTO v_req FROM public.leave_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'تمت مراجعة هذا الطلب مسبقاً'; END IF;

  UPDATE public.leave_requests
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = _note
   WHERE id = _id;

  WITH d AS (
    SELECT generate_series(v_req.start_date, v_req.end_date, interval '1 day')::date AS work_date
  ), ins AS (
    INSERT INTO public.attendance_records (employee_id, work_date, status, verification_method, notes)
    SELECT v_req.employee_id, d.work_date, 'leave', 'manual', 'leave_auto:' || v_req.id
    FROM d
    WHERE EXTRACT(DOW FROM d.work_date)::int NOT IN (5, 6)
    ON CONFLICT (employee_id, work_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_marked FROM ins;

  RETURN jsonb_build_object('ok', true, 'marked_days', v_marked);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_leave_request(uuid, text) TO authenticated;

-- ============ 3) Overlap prevention ============
CREATE OR REPLACE FUNCTION public.enforce_leave_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.leave_requests o
    WHERE o.employee_id = NEW.employee_id
      AND o.id <> NEW.id
      AND o.status IN ('pending', 'approved')
      AND o.start_date <= NEW.end_date
      AND o.end_date   >= NEW.start_date
  ) THEN
    RAISE EXCEPTION 'يوجد طلب إجازة آخر متداخل مع هذه الفترة';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_no_overlap ON public.leave_requests;
CREATE TRIGGER trg_leave_no_overlap
BEFORE INSERT OR UPDATE OF start_date, end_date, status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_no_overlap();

CREATE OR REPLACE FUNCTION public.enforce_permission_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;
  -- attendance-correction requests are stored as permission rows; they may
  -- legitimately coexist with a real permission on the same day.
  IF NEW.reason LIKE '[attendance_correction%' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.permission_requests o
    WHERE o.employee_id = NEW.employee_id
      AND o.id <> NEW.id
      AND o.request_date = NEW.request_date
      AND o.status IN ('pending', 'approved')
      AND o.reason NOT LIKE '[attendance_correction%'
      AND o.from_time < NEW.to_time
      AND o.to_time   > NEW.from_time
  ) THEN
    RAISE EXCEPTION 'يوجد إذن آخر متداخل مع هذا الوقت في نفس اليوم';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permission_no_overlap ON public.permission_requests;
CREATE TRIGGER trg_permission_no_overlap
BEFORE INSERT OR UPDATE OF request_date, from_time, to_time, status ON public.permission_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_permission_no_overlap();