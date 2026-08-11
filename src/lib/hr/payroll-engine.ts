// Single source of truth for payroll calculation.
// Used by both the manual generatePayroll server fn and the monthly cron hook,
// eliminating the previous duplicated (and diverging) logic.
//
// Correctness fixes vs. the old inline calc:
//  1. Approved leave days (attendance status "leave") are excused — never absence.
//  2. Public holidays (holidays table) are excluded from working days.
//  3. Absence is only counted for working days elapsed up to `asOfDate`
//     (fixes the day-25 cron deducting the not-yet-happened end of month).
//  4. Days before an employee's hire_date are excluded (mid-month hires).

import { datesOfMonth, datesInRange, isWeekend } from "@/lib/hr/time";

export interface EngineEmployee {
  id: string;
  department_id: string | null;
  base_salary: number | string;
  allowances: number | string;
  hire_date?: string | null;
}

export interface EngineRule {
  department_id: string | null;
  absence_deduction: number | string | null;
  late_deduction_per_minute: number | string | null;
  /** 'salary_per_30' (default, Saudi-standard: base_salary/30 per day) or 'fixed_amount' (legacy flat SAR figure). */
  absence_calc_mode?: "salary_per_30" | "fixed_amount" | null;
}

export interface EngineAttendanceRecord {
  employee_id: string;
  work_date: string;
  status: string;
  late_minutes: number | null;
  late_deduction_amount: number | string | null;
  /** Early-leave deduction recorded on the day (0 when the rule toggle is off). */
  early_leave_deduction_amount?: number | string | null;
}

export interface EngineAmountRow {
  employee_id: string;
  amount: number | string;
}

export interface EngineHoliday {
  start_date: string;
  end_date: string;
}

export interface PayrollComputedRow {
  employee_id: string;
  period_month: string;
  base_salary: number;
  allowances: number;
  bonuses_total: number;
  deductions_total: number;
  absence_days: number;
  absence_deduction: number;
  late_minutes: number;
  late_deduction: number;
  net_salary: number;
}

/** Statuses that mean the day is accounted for (not an absence). */
export const EXCUSED_OR_PRESENT = new Set(["present", "late", "early", "half_day", "leave"]);

/**
 * Absence-day count — the ONE definition shared by payroll generation and the
 * HR monthly report, so the two can never diverge.
 * @param attendedDates dates the employee has an attended/excused record for
 * @param workingDates  working days of the period (weekends + holidays already removed, capped at asOfDate)
 */
export function countAbsenceDays(
  attendedDates: Set<string>,
  workingDates: string[],
  hireDate?: string | null,
): number {
  const effective = hireDate ? workingDates.filter((d) => d >= hireDate) : workingDates;
  return effective.reduce((acc, d) => acc + (attendedDates.has(d) ? 0 : 1), 0);
}

/** Money value of absence days — shared by payroll and the monthly report. */
export function absenceDeductionFor(
  absenceDays: number,
  baseSalary: number,
  calcMode: "salary_per_30" | "fixed_amount",
  fixedDailyAmount: number,
): number {
  const dailyRate = calcMode === "salary_per_30" ? baseSalary / 30 : fixedDailyAmount;
  return absenceDays * dailyRate;
}


/** Expand holidays into a set of individual YYYY-MM-DD dates. */
export function holidayDateSet(holidays: EngineHoliday[]): Set<string> {
  const set = new Set<string>();
  for (const h of holidays ?? []) {
    for (const d of datesInRange(h.start_date, h.end_date)) set.add(d);
  }
  return set;
}

/**
 * Working dates of a month: excludes Fri/Sat and public holidays.
 * Returns sorted YYYY-MM-DD strings.
 */
export function workingDatesOfMonth(periodMonth: string, holidays: EngineHoliday[]): string[] {
  const holidaySet = holidayDateSet(holidays);
  return datesOfMonth(periodMonth).filter((d) => !isWeekend(d) && !holidaySet.has(d));
}

export interface ComputePayrollInput {
  /** YYYY-MM-01 */
  periodMonth: string;
  /**
   * Count absences only for working days <= asOfDate (YYYY-MM-DD).
   * Pass the last day of the month when generating a closed month,
   * or today's Riyadh date when generating mid-month (cron on day 25).
   */
  asOfDate: string;
  employees: EngineEmployee[];
  attendance: EngineAttendanceRecord[];
  bonuses: EngineAmountRow[];
  deductions: EngineAmountRow[];
  rules: EngineRule[];
  holidays: EngineHoliday[];
}

export function computePayrollRows(input: ComputePayrollInput): PayrollComputedRow[] {
  const { periodMonth, asOfDate, employees, attendance, bonuses, deductions, rules, holidays } =
    input;

  // Rules by department (null = global fallback).
  const ruleByDept = new Map<
    string | null,
    { absence: number; latePerMin: number; calcMode: "salary_per_30" | "fixed_amount" }
  >();
  for (const r of rules ?? []) {
    ruleByDept.set(r.department_id, {
      absence: Number(r.absence_deduction || 0),
      latePerMin: Number(r.late_deduction_per_minute || 0),
      calcMode: r.absence_calc_mode === "fixed_amount" ? "fixed_amount" : "salary_per_30",
    });
  }
  const globalRule = ruleByDept.get(null) ?? {
    absence: 0,
    latePerMin: 0,
    calcMode: "salary_per_30" as const,
  };
  const getRule = (deptId: string | null) => (deptId && ruleByDept.get(deptId)) || globalRule;

  // Attendance aggregation per employee.
  const attendedDates = new Map<string, Set<string>>();
  const lateAgg = new Map<string, { lateMinutes: number; lateDeduction: number }>();
  for (const r of attendance ?? []) {
    if (EXCUSED_OR_PRESENT.has(r.status)) {
      let set = attendedDates.get(r.employee_id);
      if (!set) attendedDates.set(r.employee_id, (set = new Set()));
      set.add(r.work_date);
    }
    const agg = lateAgg.get(r.employee_id) ?? { lateMinutes: 0, lateDeduction: 0 };
    agg.lateMinutes += r.late_minutes || 0;
    // Early-leave money is part of the same attendance-driven deduction bucket.
    agg.lateDeduction +=
      Number(r.late_deduction_amount || 0) + Number(r.early_leave_deduction_amount || 0);
    lateAgg.set(r.employee_id, agg);
  }

  // Amount sums.
  const sumBy = (rows: EngineAmountRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows ?? [])
      m.set(r.employee_id, (m.get(r.employee_id) || 0) + Number(r.amount));
    return m;
  };
  const bonusByEmp = sumBy(bonuses);
  const dedByEmp = sumBy(deductions);

  // Working days: weekends + holidays excluded, capped at asOfDate.
  const monthWorkingDates = workingDatesOfMonth(periodMonth, holidays).filter((d) => d <= asOfDate);

  return employees.map((e) => {
    const rule = getRule(e.department_id);
    const attended = attendedDates.get(e.id) ?? new Set<string>();
    const agg = lateAgg.get(e.id) ?? { lateMinutes: 0, lateDeduction: 0 };

    // Absence days + money via the shared helpers (see countAbsenceDays):
    // the HR monthly report calls the exact same functions.
    const absenceDays = countAbsenceDays(attended, monthWorkingDates, e.hire_date ?? null);
    const base = Number(e.base_salary);
    // Saudi-standard practice: daily wage = monthly base salary / 30 (fixed
    // divisor, not the actual days in the calendar month), so the deduction
    // is proportional to each employee's own salary. 'fixed_amount' is the
    // legacy flat-SAR-per-day mode, kept for departments that need it.
    const absenceDeduction = absenceDeductionFor(absenceDays, base, rule.calcMode, rule.absence);

    // Prefer record-level late deduction (flex/tiered); fallback to per-minute calc.
    const lateDeduction =
      agg.lateDeduction > 0 ? agg.lateDeduction : agg.lateMinutes * rule.latePerMin;
    const bonusesTotal = bonusByEmp.get(e.id) || 0;
    const deductionsTotal = dedByEmp.get(e.id) || 0;
    const allow = Number(e.allowances);
    const net = base + allow + bonusesTotal - deductionsTotal - absenceDeduction - lateDeduction;

    return {
      employee_id: e.id,
      period_month: periodMonth,
      base_salary: base,
      allowances: allow,
      bonuses_total: bonusesTotal,
      deductions_total: deductionsTotal,
      absence_days: absenceDays,
      absence_deduction: absenceDeduction,
      late_minutes: agg.lateMinutes,
      late_deduction: lateDeduction,
      net_salary: Math.max(0, net),
    };
  });
}
