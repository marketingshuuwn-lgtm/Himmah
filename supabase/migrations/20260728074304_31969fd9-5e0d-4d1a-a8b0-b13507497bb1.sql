
CREATE OR REPLACE FUNCTION public.try_lock_payroll_period(_period date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_xact_lock(hashtextextended(_period::text, 7700000000000002));
$$;

GRANT EXECUTE ON FUNCTION public.try_lock_payroll_period(date) TO authenticated, service_role;
