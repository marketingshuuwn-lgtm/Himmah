// Time-correction (استمارة تعديل الوقت) + early-leave / checkout-window coverage.
//
// These are pure-function tests running under the Playwright runner
// (`bunx playwright test`) — no browser is launched.
//
// Source of truth under test:
//   • classifyCheckIn()      -> the ONLY place lateness + deduction are computed
//   • computeWindowState()   -> the ONLY place punch windows are computed
//   • buildExplanation()     -> the UI breakdown; must agree with classifyCheckIn
//
// Riyadh is UTC+3 with no DST, so `...T HH:MM :00+03:00` == KSA wall clock.

import { test, expect } from "@playwright/test";
import {
  classifyCheckIn,
  computeWindowState,
  type AttendanceRule,
  type AttendanceRecord,
} from "../src/lib/hr/attendance-core";
import { buildExplanation } from "../src/lib/hr/attendance-explain";

const DAY = "2025-06-15";

function ksaAt(hhmm: string): Date {
  return new Date(`${DAY}T${hhmm}:00+03:00`);
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

function recordWith(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "a1",
    employee_id: "e1",
    work_date: DAY,
    check_in_at: `${DAY}T09:30:00+03:00`,
    check_out_at: null,
    status: "late",
    late_minutes: 30,
    late_deduction_amount: 30,
    ...overrides,
  } as unknown as AttendanceRecord;
}

/** Mirrors the dialog's impact preview: reclassify with the proposed check-in. */
function previewImpact(rule: AttendanceRule, record: AttendanceRecord, proposedIn: string) {
  const projected = classifyCheckIn(ksaAt(proposedIn), rule, 0);
  const currentDeduction = Number(record.late_deduction_amount || 0);
  return {
    currentDeduction,
    projectedDeduction: projected.deduction,
    diff: projected.deduction - currentDeduction,
    projectedStatus: projected.status,
    projectedLate: projected.lateMinutes,
  };
}

test.describe("time-correction form — grace must not shift the outcome", () => {
  test("proposing a time still inside grace clears the whole deduction", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    const rec = recordWith({ late_minutes: 30, late_deduction_amount: 30 });
    const impact = previewImpact(rule, rec, "09:10");
    expect(impact.projectedStatus).toBe("present");
    expect(impact.projectedDeduction).toBe(0);
    expect(impact.diff).toBe(-30);
  });

  test("editing the form twice is idempotent — same input, same result", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 2 });
    const rec = recordWith({ late_deduction_amount: 60 });
    const a = previewImpact(rule, rec, "09:40");
    const b = previewImpact(rule, rec, "09:40");
    expect(a).toEqual(b);
    expect(a.projectedLate).toBe(40);
    expect(a.projectedDeduction).toBe(80);
  });

  test("proposing exactly the grace edge (09:15/15m) yields zero, 09:16 yields 16 min", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    const rec = recordWith();
    expect(previewImpact(rule, rec, "09:15").projectedDeduction).toBe(0);
    expect(previewImpact(rule, rec, "09:16").projectedLate).toBe(16);
  });

  test("a 40-minute grace absorbs a 40-minute correction request", () => {
    const rule = ruleWith({ late_grace_minutes: 40, late_deduction_per_minute: 1 });
    const rec = recordWith({ late_deduction_amount: 40 });
    const impact = previewImpact(rule, rec, "09:40");
    expect(impact.projectedStatus).toBe("present");
    expect(impact.diff).toBe(-40);
  });

  test("no change proposed → zero diff (submit button stays meaningless)", () => {
    const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1 });
    const rec = recordWith({ late_minutes: 30, late_deduction_amount: 30 });
    const impact = previewImpact(rule, rec, "09:30");
    expect(impact.projectedDeduction).toBe(30);
    expect(impact.diff).toBe(0);
  });
});

test.describe("preview total == explain-dialog total (single source of truth)", () => {
  for (const hhmm of ["09:10", "09:15", "09:16", "09:30", "09:45", "09:59", "10:00"]) {
    test(`arrival ${hhmm} — buildExplanation reproduces classifyCheckIn`, () => {
      const rule = ruleWith({ late_grace_minutes: 15, late_deduction_per_minute: 1.5 });
      const cls = classifyCheckIn(ksaAt(hhmm), rule, 0);
      const explained = buildExplanation(rule, {
        status: cls.status,
        lateMinutes: cls.lateMinutes,
        deduction: cls.deduction,
      });
      expect(explained.totalDeduction).toBeCloseTo(cls.deduction, 2);
      expect(explained.status).toBe(cls.status);
    });
  }
});

test.describe("early leave — checkout window edges (30–60 min band)", () => {
  const rule = ruleWith({
    work_end: "17:00",
    checkout_window_before_min: 60,
    checkout_window_after_min: 60,
  });
  const checkedIn = recordWith({ check_in_at: `${DAY}T09:00:00+03:00`, check_out_at: null });

  test("60 min before end (16:00) — checkout window is exactly open", () => {
    const w = computeWindowState(rule, checkedIn, ksaAt("16:00"))!;
    expect(w.phase).toBe("checkout_open");
    expect(w.can_act).toBe(true);
    expect(w.checkout_window.start).toBe("16:00");
    expect(w.checkout_window.end).toBe("18:00");
  });

  test("61 min before end (15:59) — still working, button locked", () => {
    const w = computeWindowState(rule, checkedIn, ksaAt("15:59"))!;
    expect(w.phase).toBe("working");
    expect(w.can_act).toBe(false);
  });

  test("45 and 30 min before end are inside the window", () => {
    for (const t of ["16:15", "16:30"]) {
      const w = computeWindowState(rule, checkedIn, ksaAt(t))!;
      expect(w.phase, t).toBe("checkout_open");
      expect(w.can_act, t).toBe(true);
    }
  });

  test("a 30-minute checkout window rejects 16:00 and accepts 16:30", () => {
    const tight = ruleWith({ work_end: "17:00", checkout_window_before_min: 30 });
    expect(computeWindowState(tight, checkedIn, ksaAt("16:00"))!.phase).toBe("working");
    expect(computeWindowState(tight, checkedIn, ksaAt("16:30"))!.phase).toBe("checkout_open");
  });

  test("after the window closes, re-punching is locked (18:01)", () => {
    const done = recordWith({
      check_in_at: `${DAY}T09:00:00+03:00`,
      check_out_at: `${DAY}T17:05:00+03:00`,
    });
    expect(computeWindowState(rule, done, ksaAt("17:30"))!.can_act).toBe(true);
    expect(computeWindowState(rule, done, ksaAt("18:01"))!.can_act).toBe(false);
  });

  test("early checkout carries NO automatic deduction — only check-in lateness does", () => {
    // Documented invariant: the deduction engine (classifyCheckIn) is driven by
    // arrival only. Leaving early is gated by the window / permission, never
    // silently monetised. If this ever changes, this test must change with it.
    const cls = classifyCheckIn(ksaAt("09:00"), rule, 0);
    expect(cls.deduction).toBe(0);
    const explained = buildExplanation(rule, {
      status: cls.status,
      lateMinutes: cls.lateMinutes,
      deduction: cls.deduction,
    });
    expect(explained.totalDeduction).toBe(0);
  });
});
