// Consistency coverage for the shared deduction engine.
// Pure functions — no browser is launched.
//
// Guards the invariant the module exists for: punch-time classification, the
// employee-facing explanation, and payroll must all produce the same money.

import { test, expect } from "@playwright/test";
import {
  lateDeductionFor,
  lateDeductionBreakdown,
  earlyLeaveDeductionFor,
  halfDayDeductionFor,
  dailyRateFor,
  countAbsenceDays,
  absenceDeductionFor,
  type DeductionRuleLike,
} from "../src/lib/hr/deduction-engine";
import { buildExplanation } from "../src/lib/hr/attendance-explain";
import { computePayrollRows } from "../src/lib/hr/payroll-engine";
import { countLeaveDays } from "../src/lib/hr/time";
import type { AttendanceRule } from "../src/lib/hr/attendance-core";

const rule: DeductionRuleLike = {
  late_deduction_per_minute: 2,
  tiered_late_deduction: [
    { from: 1, to: 30, rate: 1 },
    { from: 31, to: 90, rate: 3 },
  ],
  half_day_deduction: 150,
  early_leave_deduction_enabled: true,
  early_leave_grace_minutes: 10,
  early_leave_deduction_per_minute: 2.5,
  absence_calc_mode: "salary_per_30",
  absence_deduction: 100,
};

test("late deduction uses the matching tier over the flat rate", () => {
  expect(lateDeductionFor(20, rule)).toBe(20);
  expect(lateDeductionBreakdown(20, rule).tier?.rate).toBe(1);
  expect(lateDeductionFor(40, rule)).toBe(120);
});

test("late deduction falls back to the per-minute rate outside all tiers", () => {
  expect(lateDeductionFor(120, rule)).toBe(240);
  expect(lateDeductionBreakdown(120, rule).tier).toBeNull();
});

test("no lateness and no rule mean no money", () => {
  expect(lateDeductionFor(0, rule)).toBe(0);
  expect(lateDeductionFor(30, null)).toBe(0);
});

test("early-leave mirrors the late shape and respects the toggle", () => {
  expect(earlyLeaveDeductionFor(20, rule)).toBe(50);
  expect(earlyLeaveDeductionFor(20, { ...rule, early_leave_deduction_enabled: false })).toBe(0);
});

test("half-day and daily rate read a single definition", () => {
  expect(halfDayDeductionFor(rule)).toBe(150);
  expect(dailyRateFor(rule, 3000)).toBe(100);
  expect(dailyRateFor({ ...rule, absence_calc_mode: "fixed_amount" }, 3000)).toBe(100);
});

test("explanation reports exactly the engine amount for a tiered late day", () => {
  const exp = buildExplanation({ ...(rule as unknown as AttendanceRule), work_start: "09:00" } as AttendanceRule, {
    status: "late",
    lateMinutes: 40,
    deduction: lateDeductionFor(40, rule),
  });
  expect(exp.totalDeduction).toBe(120);
});

test("payroll absence matches the shared absence helpers", () => {
  const workingDates = ["2026-08-03", "2026-08-04", "2026-08-05"];
  const attended = new Set(["2026-08-03"]);
  const days = countAbsenceDays(attended, workingDates);
  expect(days).toBe(2);
  expect(absenceDeductionFor(days, 3000, "salary_per_30", 0)).toBe(200);

  const rows = computePayrollRows({
    periodMonth: "2026-08-01",
    asOfDate: "2026-08-05",
    employees: [{ id: "e1", department_id: null, base_salary: 3000, allowances: 0 }],
    attendance: [
      {
        employee_id: "e1",
        work_date: "2026-08-03",
        status: "present",
        late_minutes: 0,
        late_deduction_amount: 0,
      },
    ],
    bonuses: [],
    deductions: [],
    rules: [
      {
        department_id: null,
        absence_deduction: 0,
        late_deduction_per_minute: 2,
        absence_calc_mode: "salary_per_30",
      },
    ],
    holidays: [],
  });
  // 2026-08-01/02 are Sat/Sun; only Mon-Wed are working days up to asOfDate.
  expect(rows[0].absence_deduction).toBeCloseTo(
    absenceDeductionFor(rows[0].absence_days, 3000, "salary_per_30", 0),
    6,
  );
});

test("leave days skip the weekend exactly like the approval RPC", () => {
  // 2026-08-06 is Thursday → Fri 07 + Sat 08 are excluded.
  expect(countLeaveDays("2026-08-06", "2026-08-10")).toBe(3);
  expect(countLeaveDays("2026-08-07", "2026-08-08")).toBe(0);
});
