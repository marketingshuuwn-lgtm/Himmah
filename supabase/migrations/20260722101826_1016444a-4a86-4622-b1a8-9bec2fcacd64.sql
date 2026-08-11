-- Missing columns
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE public.permission_requests ADD COLUMN IF NOT EXISTS attachment_path text;

-- Missing table
CREATE TABLE IF NOT EXISTS public.special_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  work_start time NOT NULL,
  work_end time NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_work_periods TO authenticated;
GRANT ALL ON public.special_work_periods TO service_role;

ALTER TABLE public.special_work_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "swp read authenticated" ON public.special_work_periods;
CREATE POLICY "swp read authenticated" ON public.special_work_periods
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "swp hr manage" ON public.special_work_periods;
CREATE POLICY "swp hr manage" ON public.special_work_periods
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'owner'));

DROP TRIGGER IF EXISTS swp_updated_at ON public.special_work_periods;
CREATE TRIGGER swp_updated_at BEFORE UPDATE ON public.special_work_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();