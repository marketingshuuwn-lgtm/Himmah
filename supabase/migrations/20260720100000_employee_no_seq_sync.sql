-- Confirms employee_no remains the single sequential source of truth.
-- The actual resequencing logic runs in application code (resequenceEmployeeNumbers
-- server fn) since it needs to be re-runnable on demand by HR, not just once.
-- This migration only ensures the sequence exists and stays in sync going forward.

SELECT setval(
  'public.employee_no_seq',
  GREATEST(1000, COALESCE((
    SELECT MAX(employee_no::bigint)
    FROM public.employees
    WHERE employee_no ~ '^[0-9]+$'
  ), 1000))
);
