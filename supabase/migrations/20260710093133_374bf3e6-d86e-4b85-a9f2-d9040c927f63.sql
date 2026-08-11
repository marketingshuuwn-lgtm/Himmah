
-- Enum for import kinds and statuses
DO $$ BEGIN
  CREATE TYPE public.import_kind AS ENUM ('attendance', 'employees');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_status AS ENUM ('pending','approved','rejected','applied','partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_scope AS ENUM ('self','department','all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.import_kind NOT NULL,
  scope public.import_scope NOT NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  status public.import_status NOT NULL DEFAULT 'pending',
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  filename TEXT,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users read own batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

CREATE POLICY "HR reads all batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Dept manager reads dept batches"
  ON public.import_batches FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'dept_manager')
    AND department_id IS NOT NULL
    AND department_id = public.manager_department_id(auth.uid())
  );

CREATE POLICY "Users insert own batches"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Reviewers update batches"
  ON public.import_batches FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR (public.has_role(auth.uid(), 'dept_manager')
        AND department_id IS NOT NULL
        AND department_id = public.manager_department_id(auth.uid()))
    OR submitted_by = auth.uid()
  );

-- Trigger: employees cannot change status/reviewer fields after insert
CREATE OR REPLACE FUNCTION public.enforce_import_batch_employee_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.submitted_by
     AND NOT public.has_role(auth.uid(), 'hr_admin')
     AND NOT public.has_role(auth.uid(), 'dept_manager')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'owner')
  THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note
       OR NEW.applied_count IS DISTINCT FROM OLD.applied_count
    THEN
      RAISE EXCEPTION 'Employees may not modify review fields of import batches';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_import_batch_emp_upd ON public.import_batches;
CREATE TRIGGER trg_enforce_import_batch_emp_upd
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_import_batch_employee_update();

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_import_batch_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.security_audit_log(entity_type, entity_id, action, actor_user_id, actor_kind, metadata)
    VALUES (
      'import_batch', NEW.id, 'status_change', auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'kind', NEW.kind, 'applied_count', NEW.applied_count)
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_import_batch_status ON public.import_batches;
CREATE TRIGGER trg_audit_import_batch_status
  AFTER UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_import_batch_status();

CREATE INDEX IF NOT EXISTS idx_import_batches_dept ON public.import_batches(department_id, status);
CREATE INDEX IF NOT EXISTS idx_import_batches_submitter ON public.import_batches(submitted_by, created_at DESC);
