-- Lets an employee attach a note or objection to a contract they've been
-- sent (e.g. "الراتب المذكور غير مطابق لما تم الاتفاق عليه") before/instead
-- of signing. Surfaced prominently to HR, who can correct and re-send.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS employee_note TEXT,
  ADD COLUMN IF NOT EXISTS employee_note_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contracts.employee_note IS
  'Optional objection/comment from the employee, visible to HR for correction before re-sending.';
