
CREATE TABLE public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  period TEXT NOT NULL, -- e.g. '2026-Q2' or '2026-06'
  performance SMALLINT NOT NULL CHECK (performance BETWEEN 1 AND 5),
  commitment  SMALLINT NOT NULL CHECK (commitment  BETWEEN 1 AND 5),
  teamwork    SMALLINT NOT NULL CHECK (teamwork    BETWEEN 1 AND 5),
  quality     SMALLINT NOT NULL CHECK (quality     BETWEEN 1 AND 5),
  average NUMERIC(3,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;
GRANT ALL ON public.evaluations TO service_role;

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- HR: full access
CREATE POLICY "HR manages all evaluations"
ON public.evaluations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'hr_admin'))
WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

-- Dept managers: read/write evaluations for employees in departments they manage
CREATE POLICY "Dept managers read their dept evaluations"
ON public.evaluations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = evaluations.employee_id AND d.manager_id = auth.uid()
  )
);

CREATE POLICY "Dept managers insert evaluations for their dept"
ON public.evaluations FOR INSERT TO authenticated
WITH CHECK (
  evaluator_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = employee_id AND d.manager_id = auth.uid()
  )
);

CREATE POLICY "Dept managers update their own evaluations"
ON public.evaluations FOR UPDATE TO authenticated
USING (
  evaluator_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = evaluations.employee_id AND d.manager_id = auth.uid()
  )
)
WITH CHECK (
  evaluator_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.departments d ON d.id = e.department_id
    WHERE e.id = employee_id AND d.manager_id = auth.uid()
  )
);

-- Employees: read their own
CREATE POLICY "Employees read their own evaluations"
ON public.evaluations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = evaluations.employee_id AND e.user_id = auth.uid()
  )
);

-- Auto-average trigger
CREATE OR REPLACE FUNCTION public.evaluations_set_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.average := ROUND(((NEW.performance + NEW.commitment + NEW.teamwork + NEW.quality)::numeric / 4.0), 2);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evaluations_set_average
BEFORE INSERT OR UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.evaluations_set_average();
