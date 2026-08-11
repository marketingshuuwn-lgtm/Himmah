// Cross-check: the deduction numbers shown in the adjustment/impact preview
// (classifyCheckIn + buildExplanation) must equal what computePayrollRows()
// produces for the same month using the same attendance rows.
//
// Pure-function tests under the Playwright runner — no browser is launched.

import { test, expect } from "@playwright/test";
import {
  classifyCheckIn,
  classifyEarlyLeave,
  type AttendanceRule,
} from "../src/lib/hr/attendance-core";
import { buildExplanation } from "../src/lib/hr/attendance-explain";
import { computePayrollRows } from "../src/lib/hr/payroll-engine";

const MONTH = "2025-06-01";

function ksaAt(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00+03:00`);
}

function ruleWith(overrides: Partial<AttendanceRule> = {}): AttendanceRule {
  return {
    id: "r1",
    department_id: null,
    work_start: "09:00",
    work_end: "17:00",
    late_grace_minutes: 15,
    absence_deduction: 0,
    absence_calc_mode: "salary_per_30",
    late_deduction_per_minute: 1,
    require_geo: false,
    geo_lat: null,
    geo_lng: null,
    geo_radius_m: 0,
    require_webauthn: false,
    require_selfie: false,
    flex_enabled: false,
    early_window_start: null,
    late_window_end: null,
    half_day_deduction: 100,
    tiered_late_deduction: [],
    checkout_window_before_min: 60,
    checkout_window_after_min: 60,
    checkin_window_before_min: 60,
    checkin_window_after_min: 120,
    early_leave_deduction_enabled: false,
    early_leave_grace_minutes: 0,
    early_leave_deduction_per_minute: 0,
    ...overrides,
  } as AttendanceRule;
}

/** Arrivals in the working days of June 2025 used by both engines. */
const ARRIVALS: Array<{ day: string; at: string }> = [
  { day: "2025-06-02", at: "09:10" }, // inside grace
  { day: "2025-06-03", at: "09:30" }, // 30 min late
  { day: "2025-06-04", at: "09:45" }, // 45 min late
  { day: "2025-06-05", at: "10:00" }, // 60 min late
];

function attendanceFrom(rule: AttendanceRule) {
  return ARRIVALS.map(({ day, at }) => {
    const cls = classifyCheckIn(ksaAt(day, at), rule, 0);
    return {
      employee_id: "e1",
      work_date: day,
      status: cls.status,
      late_minutes: cls.lateMinutes,
      late_deduction_amount: cls.deduction,
    };
  });
}

const employee = {
  id: "e1",
  department_id: null,
  base_salary: 9000,
  allowances: 0,
  hire_date: "2020-01-01",
};

const engineRule = (rule: AttendanceRule) => ({
  department_id: null,
  absence_deduction: rule.absence_deduction,
  late_deduction_per_minute: rule.late_deduction_per_minute,
  absence_calc_mode: "salary_per_30" as const,
});

test.describe("adjustment preview vs generatePayroll — same source of truth", () => {
  test("late deductions in the preview sum exactly to payroll late_deduction", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1.5 });
    const attendance = attendanceFrom(rule);

    // Preview side: what the employee sees per day in the explain dialog.
    const previewTotal = attendance.reduce((acc, r) => {
      const explained = buildExplanation(rule, {
        status: r.status,
        lateMinutes: r.late_minutes,
        deduction: Number(r.late_deduction_amount),
      });
      return acc + explained.totalDeduction;
    }, 0);

    // Payroll side: same rows fed to the payroll engine.
    const [row] = computePayrollRows({
      periodMonth: MONTH,
      asOfDate: "2025-06-05",
      employees: [employee],
      attendance,
      bonuses: [],
      deductions: [],
      rules: [engineRule(rule)],
      holidays: [],
    });

    expect(previewTotal).toBeCloseTo(row.late_deduction, 2);
    // 30 + 45 + 60 minutes beyond grace-free counting, 09:10 excluded.
    expect(row.late_minutes).toBe(135);
  });

  test("changing the grace to 40 min shifts BOTH engines identically", () => {
    const rule = ruleWith({ late_grace_minutes: 40, late_deduction_per_minute: 1 });
    const attendance = attendanceFrom(rule);
    const previewTotal = attendance.reduce(
      (acc, r) =>
        acc +
        buildExplanation(rule, {
          status: r.status,
          lateMinutes: r.late_minutes,
          deduction: Number(r.late_deduction_amount),
        }).totalDeduction,
      0,
    );
    const [row] = computePayrollRows({
      periodMonth: MONTH,
      asOfDate: "2025-06-05",
      employees: [employee],
      attendance,
      bonuses: [],
      deductions: [],
      rules: [engineRule(rule)],
      holidays: [],
    });
    expect(previewTotal).toBeCloseTo(row.late_deduction, 2);
  });

  test("an approved correction that clears the deduction clears it in payroll too", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    const attendance = attendanceFrom(rule);

    // Approving a correction re-runs classifyCheckIn with the corrected time.
    const corrected = attendance.map((r) =>
      r.work_date === "2025-06-03"
        ? (() => {
            const cls = classifyCheckIn(ksaAt(r.work_date, "09:05"), rule, 0);
            return {
              ...r,
              status: cls.status,
              late_minutes: cls.lateMinutes,
              late_deduction_amount: cls.deduction,
            };
          })()
        : r,
    );

    const [before] = computePayrollRows({
      periodMonth: MONTH,
      asOfDate: "2025-06-05",
      employees: [employee],
      attendance,
      bonuses: [],
      deductions: [],
      rules: [engineRule(rule)],
      holidays: [],
    });
    const [after] = computePayrollRows({
      periodMonth: MONTH,
      asOfDate: "2025-06-05",
      employees: [employee],
      attendance: corrected,
      bonuses: [],
      deductions: [],
      rules: [engineRule(rule)],
      holidays: [],
    });

    expect(before.late_deduction - after.late_deduction).toBeCloseTo(30, 2);
  });
});

test.describe("early-leave deduction toggle", () => {
  const day = "2025-06-02";

  test("disabled by default — leaving at 16:00 costs nothing", () => {
    const rule = ruleWith();
    const early = classifyEarlyLeave(ksaAt(day, "16:00"), rule, null);
    expect(early.enabled).toBe(false);
    expect(early.deduction).toBe(0);
  });

  test("enabled: 60 min early with a 15 min grace deducts 60 × rate", () => {
    const rule = ruleWith({
      early_leave_deduction_enabled: true,
      early_leave_grace_minutes: 15,
      early_leave_deduction_per_minute: 2,
    });
    const early = classifyEarlyLeave(ksaAt(day, "16:00"), rule, null);
    expect(early.earlyMinutes).toBe(60);
    expect(early.deduction).toBe(120);
  });

  test("inside the early-leave grace (16:50 with 15 min grace) is free", () => {
    const rule = ruleWith({
      early_leave_deduction_enabled: true,
      early_leave_grace_minutes: 15,
      early_leave_deduction_per_minute: 2,
    });
    expect(classifyEarlyLeave(ksaAt(day, "16:50"), rule, null).deduction).toBe(0);
  });

  test("an approved early-leave permission removes the deduction", () => {
    const rule = ruleWith({
      early_leave_deduction_enabled: true,
      early_leave_grace_minutes: 0,
      early_leave_deduction_per_minute: 2,
    });
    // Permission from 15:00 (900 minutes of the Riyadh day).
    expect(classifyEarlyLeave(ksaAt(day, "16:00"), rule, 15 * 60).deduction).toBe(0);
  });

  test("explain dialog surfaces the early-leave amount in the total", () => {
    const rule = ruleWith({
      early_leave_deduction_enabled: true,
      early_leave_grace_minutes: 10,
      early_leave_deduction_per_minute: 1,
    });
    const early = classifyEarlyLeave(ksaAt(day, "16:00"), rule, null);
    const explained = buildExplanation(rule, {
      status: "present",
      lateMinutes: 0,
      deduction: 0,
      earlyLeaveMinutes: early.earlyMinutes,
      earlyLeaveDeduction: early.deduction,
    });
    expect(explained.totalDeduction).toBeCloseTo(early.deduction, 2);
    expect(early.deduction).toBe(60);
  });

  test("early-leave money reaches payroll through the attendance rows", () => {
    const rule = ruleWith({
      early_leave_deduction_enabled: true,
      early_leave_grace_minutes: 0,
      early_leave_deduction_per_minute: 1,
    });
    const early = classifyEarlyLeave(ksaAt(day, "16:00"), rule, null);
    const [row] = computePayrollRows({
      periodMonth: MONTH,
      asOfDate: "2025-06-02",
      employees: [employee],
      attendance: [
        {
          employee_id: "e1",
          work_date: day,
          status: "present",
          late_minutes: 0,
          late_deduction_amount: 0,
          early_leave_deduction_amount: early.deduction,
        },
      ],
      bonuses: [],
      deductions: [],
      rules: [engineRule(rule)],
      holidays: [],
    });
    expect(row.late_deduction).toBeCloseTo(early.deduction, 2);
  });
});
