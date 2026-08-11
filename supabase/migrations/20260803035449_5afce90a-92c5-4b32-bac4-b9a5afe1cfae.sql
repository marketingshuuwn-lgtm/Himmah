ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS pending_employee_fields jsonb NOT NULL DEFAULT '[]'::jsonb;