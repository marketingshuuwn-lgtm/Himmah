
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS employee_note text,
  ADD COLUMN IF NOT EXISTS employee_note_at timestamptz;
