-- Employee number auto-assignment.
-- NOTE: employees.employee_no already exists as TEXT UNIQUE NOT NULL since
-- the original schema — this migration only adds automatic numbering:
-- the sequence starts after the highest numeric value already in use, and
-- new employees get the next number (as text) automatically.

CREATE SEQUENCE IF NOT EXISTS public.employee_no_seq START WITH 1001;

SELECT setval(
  'public.employee_no_seq',
  GREATEST(1000, COALESCE((
    SELECT MAX(employee_no::bigint)
    FROM public.employees
    WHERE employee_no ~ '^[0-9]+$'
  ), 1000))
);

ALTER TABLE public.employees
  ALTER COLUMN employee_no SET DEFAULT nextval('public.employee_no_seq')::text;
