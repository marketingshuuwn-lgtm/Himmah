// Unit-style coverage for the grace-period / late-classification engine.
// Runs under the existing Playwright test runner (`bunx playwright test`).
// The engine is a pure function, so no browser is launched.
//
// Riyadh is UTC+3 with no DST — building `new Date("YYYY-MM-DDTHH:MM:00+03:00")`
// gives us a Date whose Riyadh wall-clock time is exactly HH:MM.

import { test, expect } from "@playwright/test";
import {
  classifyCheckIn,
  type AttendanceRule,
} from "../src/lib/hr/attendance-core";

function ksaAt(hhmm: string): Date {
  return new Date(`2025-06-15T${hhmm}:00+03:00`);
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
    ...overrides,
  } as AttendanceRule;
}

test.describe("classifyCheckIn — grace window (non-flex)", () => {
  test("early arrival: present, zero deduction", () => {
    const rule = ruleWith({ late_grace_minutes: 15 });
    const res = classifyCheckIn(ksaAt("08:45"), rule);
    expect(res.status).toBe("present");
    expect(res.lateMinutes).toBe(0);
    expect(res.deduction).toBe(0);
  });

  test("exactly at grace edge (09:15 with 15m grace) is still present", () => {
    const rule = ruleWith({ late_grace_minutes: 15 });
    const res = classifyCheckIn(ksaAt("09:15"), rule);
    expect(res.status).toBe("present");
    expect(res.deduction).toBe(0);
  });

  test("one minute past grace (09:16 with 15m grace) is late", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    const res = classifyCheckIn(ksaAt("09:16"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(16);
    expect(res.deduction).toBe(16);
  });

  test("30 min late with 15m grace → 30 min lateness × per-min rate", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 2 });
    const res = classifyCheckIn(ksaAt("09:30"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(30);
    expect(res.deduction).toBe(60);
  });

  test("40 min late with 40m grace → still present", () => {
    const rule = ruleWith({ late_grace_minutes: 40 });
    const res = classifyCheckIn(ksaAt("09:40"), rule);
    expect(res.status).toBe("present");
    expect(res.deduction).toBe(0);
  });

  test("41 min late with 40m grace → late by 41 min", () => {
    const rule = ruleWith({ late_grace_minutes: 40, late_deduction_per_minute: 1.5 });
    const res = classifyCheckIn(ksaAt("09:41"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(41);
    expect(res.deduction).toBeCloseTo(61.5, 2);
  });

  test("60 min late, no grace configured, still applies per-minute rate", () => {
    const rule = ruleWith({ late_grace_minutes: 0, late_deduction_per_minute: 1 });
    const res = classifyCheckIn(ksaAt("10:00"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(60);
    expect(res.deduction).toBe(60);
  });

  test("approved late-arrival excuse absorbs lateness", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    // excuseUntilM = 09:45 → arriving 09:50 counts as 5 min after excuse,
    // still inside grace (15) → present, no deduction.
    const excuseUntilM = 9 * 60 + 45;
    const res = classifyCheckIn(ksaAt("09:50"), rule, excuseUntilM);
    expect(res.status).toBe("present");
    expect(res.deduction).toBe(0);
  });
});

test.describe("classifyCheckIn — tiered deduction (flex only)", () => {
  test("30 min falls into 16–45 tier at 2 SAR/min", () => {
    const rule = ruleWith({
      flex_enabled: true,
      early_window_start: "07:00",
      late_window_end: "11:00",
      late_grace_minutes: 15,
      late_deduction_per_minute: 999, // ignored when a tier matches
      tiered_late_deduction: [
        { from: 1, to: 15, rate: 0.5 },
        { from: 16, to: 45, rate: 2 },
        { from: 46, to: 999, rate: 5 },
      ],
    });
    const res = classifyCheckIn(ksaAt("09:30"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(30);
    expect(res.deduction).toBe(60); // 2 × 30
  });
});

test.describe("classifyCheckIn — flex mode", () => {
  test("late beyond late_window_end triggers half_day", () => {
    const rule = ruleWith({
      flex_enabled: true,
      late_grace_minutes: 15,
      early_window_start: "07:00",
      late_window_end: "10:00",
      half_day_deduction: 150,
    });
    const res = classifyCheckIn(ksaAt("10:30"), rule);
    expect(res.status).toBe("half_day");
    expect(res.deduction).toBe(150);
  });

  test("inside flex late window with 30 min late → late by 30", () => {
    const rule = ruleWith({
      flex_enabled: true,
      late_grace_minutes: 15,
      early_window_start: "07:00",
      late_window_end: "10:00",
      late_deduction_per_minute: 1,
      tiered_late_deduction: [],
    });
    const res = classifyCheckIn(ksaAt("09:30"), rule);
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(30);
  });
});
