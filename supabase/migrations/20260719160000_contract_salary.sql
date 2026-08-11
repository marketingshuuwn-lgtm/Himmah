-- Structured salary on contracts: closes the gap where a signed
-- salary_amendment contract had no effect on the operational salary.
-- On signature, application code applies contract.salary (and allowances)
-- to employees.base_salary as of effective_date — single source of truth
-- restored: the signed contract drives the payroll base.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS salary NUMERIC,
  ADD COLUMN IF NOT EXISTS allowances NUMERIC,
  ADD COLUMN IF NOT EXISTS effective_date DATE;

COMMENT ON COLUMN public.contracts.salary IS
  'Structured base salary. When present on employment/salary_amendment contracts, it is applied to employees.base_salary upon signing.';
