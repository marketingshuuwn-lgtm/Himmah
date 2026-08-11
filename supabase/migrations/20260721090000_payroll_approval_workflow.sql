-- Payroll approval workflow: a generated payroll run is not automatically
-- final. HR/admin must explicitly approve before it's sent to the
-- employee; the employee then either approves it or raises an objection
-- (reusing the existing payroll_disputes channel), which sends it back
-- for correction rather than leaving it in limbo.
--
-- State machine:
--   draft                 -> just (re)generated, HR/admin hasn't reviewed yet
--   pending_admin_approval -> explicitly requested for HR/admin sign-off
--   approved              -> HR/admin signed off; not yet visible to employee
--   sent_to_employee      -> employee notified, can approve or object
--   employee_approved     -> final, employee confirmed the amounts
--   employee_objected     -> employee raised a dispute; cycles back to draft
--                             once HR corrects and regenerates

CREATE TYPE public.payroll_approval_status AS ENUM (
  'draft',
  'pending_admin_approval',
  'approved',
  'sent_to_employee',
  'employee_approved',
  'employee_objected'
);

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS approval_status public.payroll_approval_status
    NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS employee_decided_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payroll_runs.approval_status IS
  'draft -> pending_admin_approval -> approved -> sent_to_employee -> employee_approved | employee_objected (cycles back to draft on correction).';

-- HR-configurable automatic generation day (global setting: which day of
-- the month the scheduled payroll generation runs). Stored on a small
-- singleton settings table rather than hardcoding day 25 in the cron.
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  auto_generate_day SMALLINT NOT NULL DEFAULT 25 CHECK (auto_generate_day BETWEEN 1 AND 28),
  auto_request_approval BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.payroll_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT, UPDATE ON public.payroll_settings TO authenticated;
GRANT ALL ON public.payroll_settings TO service_role;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR reads payroll settings" ON public.payroll_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "HR updates payroll settings" ON public.payroll_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));
