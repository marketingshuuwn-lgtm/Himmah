-- Absence deduction calculation mode. Default per common Saudi payroll
-- practice: daily wage = monthly base salary / 30 (fixed divisor,
-- regardless of the actual number of days in the calendar month), so the
-- deduction is proportional to each employee's own salary rather than a
-- flat department-wide amount.
--
-- 'salary_per_30'  -> (employee.base_salary / 30) * absence_days   [default]
-- 'fixed_amount'   -> attendance_rules.absence_deduction * absence_days
--                     (legacy flat-amount mode, kept for departments that
--                     need it for contractual reasons)

CREATE TYPE public.absence_calc_mode AS ENUM ('salary_per_30', 'fixed_amount');

ALTER TABLE public.attendance_rules
  ADD COLUMN IF NOT EXISTS absence_calc_mode public.absence_calc_mode
    NOT NULL DEFAULT 'salary_per_30';

COMMENT ON COLUMN public.attendance_rules.absence_calc_mode IS
  'salary_per_30: daily wage = base_salary/30 (Saudi standard practice). fixed_amount: uses absence_deduction as a flat SAR figure regardless of individual salary.';
