// Overnight shifts (e.g. 22:00 → 06:00) used to break every minute-of-day
// comparison: a 01:30 checkout looked like ~19 hours "early". The core now
// linearises the clock onto the shift axis; these tests pin that behaviour.

import { test, expect } from "@playwright/test";
import {
  classifyCheckIn,
  classifyEarlyLeave,
  computeWindowState,
  isOvernightRule,
  type AttendanceRule,
  type AttendanceRecord,
} from "../src/lib/hr/attendance-core";

function ksaAt(day: string, hhmm: string): Date {
  return new Date(`2025-06-${day}T${hhmm}:00+03:00`);
}

function nightRule(overrides: Partial<AttendanceRule> = {}): AttendanceRule {
  return {
    id: "night",
    department_id: null,
    work_start: "22:00",
    work_end: "06:00",
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
    early_leave_deduction_enabled: true,
    early_leave_grace_minutes: 10,
    early_leave_deduction_per_minute: 2,
    ...overrides,
  } as AttendanceRule;
}

test.describe("overnight shift (22:00 → 06:00)", () => {
  test("detected as overnight", () => {
    expect(isOvernightRule(nightRule())).toBe(true);
    expect(isOvernightRule({ work_start: "09:00", work_end: "17:00" })).toBe(false);
  });

  test("on-time arrival at 22:05 is present", () => {
    const res = classifyCheckIn(ksaAt("15", "22:05"), nightRule());
    expect(res.status).toBe("present");
    expect(res.deduction).toBe(0);
  });

  test("arrival at 22:40 is late by 40 minutes", () => {
    const res = classifyCheckIn(ksaAt("15", "22:40"), nightRule());
    expect(res.status).toBe("late");
    expect(res.lateMinutes).toBe(40);
  });

  test("checkout at 06:00 next morning is NOT early leave", () => {
    const res = classifyEarlyLeave(ksaAt("16", "06:00"), nightRule());
    expect(res.earlyMinutes).toBe(0);
    expect(res.deduction).toBe(0);
  });

  test("checkout at 05:00 next morning is 60 minutes early", () => {
    const res = classifyEarlyLeave(ksaAt("16", "05:00"), nightRule());
    expect(res.earlyMinutes).toBe(60);
    expect(res.deduction).toBe(120); // 60 × 2 SAR
  });

  test("checkout window opens at 05:00 and stays open at 01:00-working", () => {
    const record = {
      check_in_at: "2025-06-15T19:05:00.000Z",
      check_out_at: null,
    } as unknown as AttendanceRecord;
    const working = computeWindowState(nightRule(), record, ksaAt("16", "01:00"));
    expect(working?.phase).toBe("working");
    const open = computeWindowState(nightRule(), record, ksaAt("16", "05:30"));
    expect(open?.phase).toBe("checkout_open");
    expect(open?.can_act).toBe(true);
    expect(open?.checkout_window).toEqual({ start: "05:00", end: "07:00" });
  });

  test("check-in window opens one hour before the night start", () => {
    const state = computeWindowState(nightRule(), null, ksaAt("15", "21:10"));
    expect(state?.phase).toBe("checkin_open");
    expect(state?.checkin_window).toEqual({ start: "21:00", end: "00:00" });
  });
});
