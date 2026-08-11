-- Special work-hours periods — e.g. reduced Ramadan hours (a Saudi Labor
-- Law requirement) or summer hours. During an active period, the
-- specified work_start/work_end override the department's (or the
-- company-wide) normal attendance_rules hours for classification purposes.
-- A null department_id means the period applies company-wide.

CREATE TABLE IF NOT EXISTS public.special_work_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  work_start TIME NOT NULL,
  work_end TIME NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.special_work_periods TO authenticated;
GRANT ALL ON public.special_work_periods TO service_role;
ALTER TABLE public.special_work_periods ENABLE ROW LEVEL SECURITY;

-- Everyone can read (needed so the attendance engine can apply it for any
-- employee); only hr_admin manages it.
CREATE POLICY "Everyone reads special work periods" ON public.special_work_periods
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "HR manages special work periods" ON public.special_work_periods
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));
