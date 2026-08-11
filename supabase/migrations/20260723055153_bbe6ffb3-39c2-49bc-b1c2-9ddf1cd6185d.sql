
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS departments_code_uidx
  ON public.departments (UPPER(code)) WHERE code IS NOT NULL;

UPDATE public.departments SET code = 'MRT'  WHERE code IS NULL AND name ILIKE '%تسويق%';
UPDATE public.departments SET code = 'EXE'  WHERE code IS NULL AND name ILIKE '%تنفيذ%';
UPDATE public.departments SET code = 'CONS' WHERE code IS NULL AND name ILIKE '%مشروع%';
UPDATE public.departments SET code = 'CONS' WHERE code IS NULL AND name ILIKE '%استشار%';
UPDATE public.departments SET code = 'TEC'  WHERE code IS NULL AND (name ILIKE '%تقني%' OR name ILIKE '%تكنولوج%');
UPDATE public.departments SET code = 'HR'   WHERE code IS NULL AND name ILIKE '%موارد%';

-- Fallback synthetic codes via a subquery (no window function in the UPDATE target).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.departments WHERE code IS NULL
)
UPDATE public.departments d
   SET code = 'D' || LPAD(ranked.rn::text, 2, '0')
  FROM ranked
 WHERE d.id = ranked.id;

CREATE OR REPLACE FUNCTION public.generate_employee_no(_dept_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text; v_next int;
BEGIN
  IF _dept_id IS NULL THEN RETURN NULL; END IF;
  SELECT UPPER(code) INTO v_code FROM public.departments WHERE id = _dept_id;
  IF v_code IS NULL OR v_code = '' THEN RETURN NULL; END IF;
  SELECT COALESCE(MAX((regexp_replace(employee_no, '^[A-Z]+-', ''))::int), 0) + 1
    INTO v_next
    FROM public.employees
   WHERE employee_no ~ ('^' || v_code || '-\d+$');
  RETURN v_code || '-' || LPAD(v_next::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_employee_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_new text; v_old_code text; v_new_code text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.department_id IS NOT NULL
       AND (NEW.employee_no IS NULL OR NEW.employee_no = '' OR NEW.employee_no LIKE 'EMP%') THEN
      v_new := public.generate_employee_no(NEW.department_id);
      IF v_new IS NOT NULL THEN NEW.employee_no := v_new; END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.department_id IS DISTINCT FROM OLD.department_id AND NEW.department_id IS NOT NULL THEN
    SELECT UPPER(code) INTO v_old_code FROM public.departments WHERE id = OLD.department_id;
    SELECT UPPER(code) INTO v_new_code FROM public.departments WHERE id = NEW.department_id;
    IF v_new_code IS NOT NULL
       AND (v_old_code IS NULL OR NEW.employee_no ~ ('^' || v_old_code || '-\d+$') OR NEW.employee_no LIKE 'EMP%') THEN
      v_new := public.generate_employee_no(NEW.department_id);
      IF v_new IS NOT NULL THEN NEW.employee_no := v_new; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_employee_no ON public.employees;
CREATE TRIGGER trg_assign_employee_no
  BEFORE INSERT OR UPDATE OF department_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_employee_no();

ALTER TABLE public.employees ALTER COLUMN employee_no DROP DEFAULT;
ALTER TABLE public.employees ALTER COLUMN employee_no DROP NOT NULL;

-- Resequence existing employees per department, in hire_date order.
DO $$
DECLARE d RECORD; e RECORD; v_code text; v_n int;
BEGIN
  FOR d IN SELECT id, UPPER(code) AS code FROM public.departments WHERE code IS NOT NULL LOOP
    v_code := d.code;
    v_n := 1;
    FOR e IN
      SELECT id FROM public.employees
       WHERE department_id = d.id
       ORDER BY hire_date NULLS LAST, created_at, id
    LOOP
      UPDATE public.employees
         SET employee_no = v_code || '-' || LPAD(v_n::text, 3, '0')
       WHERE id = e.id;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
END $$;
