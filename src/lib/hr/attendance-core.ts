/**
 * Attendance core — pure, framework-free types and logic.
 *
 * Everything here is deliberately kept OUT of `attendance.functions.ts`:
 * modules that declare `createServerFn` are transformed at build time and
 * their non-exported module-scope siblings are dropped from the server
 * bundle, which produces runtime `ReferenceError`s even though typecheck
 * passes. Server-function files must stay thin wrappers, so all shared
 * logic lives in this module (pure) or `attendance-rules.server.ts` (I/O).
 */

import { riyadhNowMinutes, riyadhIsoAt } from "@/lib/hr/time";
import {
  lateDeductionFor,
  halfDayDeductionFor,
  earlyLeaveDeductionFor,
} from "@/lib/hr/deduction-engine";

export interface LateTier {
  from: number;
  to: number;
  rate: number;
}

export interface AttendanceRule {
  id: string;
  department_id: string | null;
  work_start: string;
  work_end: string;
  late_grace_minutes: number;
  absence_deduction: number;
  absence_calc_mode: "salary_per_30" | "fixed_amount";
  late_deduction_per_minute: number;
  require_geo: boolean;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radius_m: number;
  require_webauthn: boolean;
  require_selfie: boolean;
  flex_enabled: boolean;
  early_window_start: string | null;
  late_window_end: string | null;
  half_day_deduction: number;
  tiered_late_deduction: LateTier[];
  checkout_window_before_min: number;
  checkout_window_after_min: number;
  checkin_window_before_min: number;
  checkin_window_after_min: number;
  /** When true, leaving before work_end (beyond the grace) is deducted. */
  early_leave_deduction_enabled: boolean;
  early_leave_grace_minutes: number;
  early_leave_deduction_per_minute: number;
}

export type PunchPhase =
  | "before_checkin"
  | "checkin_open"
  | "checkin_missed"
  | "working"
  | "checkout_open"
  | "checkout_late"
  | "done";

export interface PunchWindowState {
  phase: PunchPhase;
  action: "check_in" | "check_out" | "none";
  can_act: boolean;
  opens_at: string | null;
  closes_at: string | null;
  checkin_window: { start: string; end: string };
  checkout_window: { start: string; end: string };
}

export type AttendanceStatus = "present" | "late" | "absent" | "leave" | "early" | "half_day";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: AttendanceStatus;
  late_minutes: number;
  late_deduction_amount: number;
  manually_edited: boolean;
  verification_method: "manual" | "geo" | "webauthn";
  notes: string | null;
  early_leave_minutes?: number;
  early_leave_deduction_amount?: number;
}

export interface MissedCheckoutAlert {
  record_id: string;
  work_date: string;
  check_in_at: string;
}

export interface ShiftInfo {
  name: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface MonthSummary {
  present: number;
  late: number;
  early: number;
  half_day: number;
  absent: number;
  total_late_minutes: number;
  total_late_deduction: number;
}

export interface MyAttendanceContext {
  employee_id: string | null;
  rule: AttendanceRule | null;
  today: AttendanceRecord | null;
  recent: AttendanceRecord[];
  missed_checkout: MissedCheckoutAlert | null;
  window_state: PunchWindowState | null;
  shift: ShiftInfo | null;
  can_override: boolean;
  month_summary: MonthSummary;
}

export type CorrectionStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface CorrectionInfo {
  permission_id: string;
  record_id: string | null;
  work_date: string;
  status: CorrectionStatus;
  suggested_check_in: string;
  suggested_check_out: string;
  reason: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// ---------------- geometry / time primitives ----------------

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function hmToMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function hmToMinSafe(hhmm: string | null | undefined, fallback: number) {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fmtHM(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO instant for today's Riyadh wall-clock at `minutes`. */
export function todayIsoAt(now: Date, minutes: number): string {
  return riyadhIsoAt(minutes, now);
}

/**
 * True when the rule's working hours cross midnight (e.g. 22:00 → 06:00).
 * Overnight shifts are handled by shifting the end (and every window derived
 * from it) into "minutes since work_start", so all comparisons stay linear.
 */
export function isOvernightRule(rule: { work_start: string; work_end: string }): boolean {
  return hmToMin(rule.work_end) <= hmToMin(rule.work_start);
}

/**
 * Normalises "now" onto the same linear axis as an overnight shift:
 * a 01:30 punch during a 22:00→06:00 shift becomes 25:30.
 */
export function linearizeNow(nowM: number, startM: number, overnight: boolean): number {
  if (!overnight) return nowM;
  // Anything earlier than a few hours before the shift start belongs to the
  // following calendar day of the same shift.
  return nowM < startM - 240 ? nowM + 1440 : nowM;
}

// ---------------- rule normalisation ----------------

export function normalizeRule(raw: any): AttendanceRule {
  return {
    ...raw,
    flex_enabled: !!raw.flex_enabled,
    require_selfie: !!raw.require_selfie,
    early_window_start: raw.early_window_start ?? null,
    late_window_end: raw.late_window_end ?? null,
    half_day_deduction: Number(raw.half_day_deduction ?? 0),
    tiered_late_deduction: Array.isArray(raw.tiered_late_deduction)
      ? raw.tiered_late_deduction
      : [],
    checkout_window_before_min: Number(raw.checkout_window_before_min ?? 60),
    checkout_window_after_min: Number(raw.checkout_window_after_min ?? 60),
    checkin_window_before_min: Number(raw.checkin_window_before_min ?? 60),
    checkin_window_after_min: Number(raw.checkin_window_after_min ?? 120),
    network_label: raw.network_label ?? null,
    allowed_ip_ranges: Array.isArray(raw.allowed_ip_ranges) ? raw.allowed_ip_ranges : [],
    absence_calc_mode: raw.absence_calc_mode === "fixed_amount" ? "fixed_amount" : "salary_per_30",
    early_leave_deduction_enabled: !!raw.early_leave_deduction_enabled,
    early_leave_grace_minutes: Number(raw.early_leave_grace_minutes ?? 0),
    early_leave_deduction_per_minute: Number(raw.early_leave_deduction_per_minute ?? 0),
  } as AttendanceRule;
}

/**
 * An assigned shift (employee_shifts, date-effective) takes precedence over
 * the department rule's work_start/work_end. Deductions, grace, geo, network
 * and punch windows keep coming from the rule; flex mode is disabled under a
 * shift because flex windows are defined relative to the rule's own times.
 */
export function applyShiftToRule(
  rule: AttendanceRule | null,
  shift: ShiftInfo | null,
): AttendanceRule | null {
  if (!rule || !shift) return rule;
  return {
    ...rule,
    work_start: shift.start,
    work_end: shift.end,
    flex_enabled: false,
    early_window_start: null,
    late_window_end: null,
  } as AttendanceRule;
}

export function applySpecialPeriodToRule(
  rule: AttendanceRule | null,
  special: { work_start: string; work_end: string } | null,
): AttendanceRule | null {
  if (!rule || !special) return rule;
  return {
    ...rule,
    work_start: special.work_start,
    work_end: special.work_end,
    // Special-period hours are an absolute override — flex windows were
    // computed relative to the normal hours and no longer apply.
    flex_enabled: false,
    early_window_start: null,
    late_window_end: null,
  } as AttendanceRule;
}

// ---------------- IP allowlist matching ----------------

export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const toInt = (v: string) => {
    const parts = v.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
      return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  };
  const ipInt = toInt(ip);
  const baseInt = toInt(base);
  if (ipInt == null || baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32)
    return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function ipMatchesRanges(ip: string, ranges: string[]): boolean {
  if (!ip) return false;
  return ranges.some((r) => {
    const range = (r || "").trim();
    if (!range) return false;
    if (range.includes("/")) return ipInCidr(ip, range);
    if (range.endsWith(".")) return ip.startsWith(range);
    return ip === range;
  });
}

// ---------------- classification ----------------

/** Classify check-in time against a rule. Returns status, late minutes, and deduction. */
export function classifyCheckIn(now: Date, rule: AttendanceRule | null, excuseUntilM = 0) {
  if (!rule) return { status: "present" as AttendanceStatus, lateMinutes: 0, deduction: 0 };
  // Riyadh wall-clock — rules (work_start etc.) are defined in local KSA time.
  const startM = hmToMin(rule.work_start);
  const overnight = isOvernightRule(rule);
  const nowM = linearizeNow(riyadhNowMinutes(now), startM, overnight);
  const grace = rule.late_grace_minutes ?? 0;
  // Approved late-arrival permission: lateness only counts after its end.
  const effStartM = Math.max(startM, excuseUntilM);

  if (rule.flex_enabled) {
    const earlyM = rule.early_window_start ? hmToMin(rule.early_window_start) : startM - 120;
    const lateEndM = Math.max(
      rule.late_window_end ? hmToMin(rule.late_window_end) : startM + 180,
      effStartM + grace,
    );

    if (nowM < earlyM) {
      // before window: treat as early but no benefit
      return { status: "early" as AttendanceStatus, lateMinutes: 0, deduction: 0 };
    }
    if (nowM < startM) {
      return { status: "early" as AttendanceStatus, lateMinutes: 0, deduction: 0 };
    }
    if (nowM <= effStartM + grace) {
      return { status: "present" as AttendanceStatus, lateMinutes: 0, deduction: 0 };
    }
    if (nowM <= lateEndM) {
      const lateMin = nowM - effStartM;
      return {
        status: "late" as AttendanceStatus,
        lateMinutes: lateMin,
        deduction: lateDeductionFor(lateMin, rule),
      };
    }
    return {
      status: "half_day" as AttendanceStatus,
      lateMinutes: nowM - effStartM,
      deduction: halfDayDeductionFor(rule),
    };
  }

  // Non-flex: simple grace, then the shared late formula (tier → per-minute).
  if (nowM <= effStartM + grace) {
    return { status: "present" as AttendanceStatus, lateMinutes: 0, deduction: 0 };
  }
  const lateMin = nowM - effStartM;
  return {
    status: "late" as AttendanceStatus,
    lateMinutes: lateMin,
    deduction: lateDeductionFor(lateMin, rule),
  };
}

export interface EarlyLeaveResult {
  /** Minutes before work_end, after subtracting the early-leave grace. 0 when on time. */
  earlyMinutes: number;
  /** SAR deducted for the early departure. Always 0 when the toggle is off. */
  deduction: number;
  enabled: boolean;
}

/**
 * Early-leave classification — the ONLY place an early departure becomes money.
 * Disabled by default: `early_leave_deduction_enabled` must be turned on in the
 * attendance rule. `excuseFromM` is an approved early-leave permission (minutes
 * of the Riyadh day); leaving after it is never deducted.
 */
export function classifyEarlyLeave(
  checkOut: Date,
  rule: AttendanceRule | null,
  excuseFromM: number | null = null,
): EarlyLeaveResult {
  if (!rule || !rule.early_leave_deduction_enabled) {
    return { earlyMinutes: 0, deduction: 0, enabled: false };
  }
  const startM = hmToMin(rule.work_start);
  const overnight = isOvernightRule(rule);
  const outM = linearizeNow(riyadhNowMinutes(checkOut), startM, overnight);
  const endM = overnight ? hmToMin(rule.work_end) + 1440 : hmToMin(rule.work_end);
  const grace = Number(rule.early_leave_grace_minutes || 0);
  const excuse = excuseFromM == null ? null : linearizeNow(excuseFromM, startM, overnight);
  const effEndM = excuse != null ? Math.min(endM, excuse) : endM;
  const diff = effEndM - outM;
  if (diff <= grace) return { earlyMinutes: 0, deduction: 0, enabled: true };
  return { earlyMinutes: diff, deduction: earlyLeaveDeductionFor(diff, rule), enabled: true };
}

export function summarize(records: AttendanceRecord[]): MonthSummary {
  const s: MonthSummary = {
    present: 0,
    late: 0,
    early: 0,
    half_day: 0,
    absent: 0,
    total_late_minutes: 0,
    total_late_deduction: 0,
  };
  for (const r of records) {
    if (r.status === "present") s.present++;
    else if (r.status === "late") s.late++;
    else if (r.status === "early") s.early++;
    else if (r.status === "half_day") s.half_day++;
    else if (r.status === "absent") s.absent++;
    s.total_late_minutes += r.late_minutes || 0;
    s.total_late_deduction += Number(r.late_deduction_amount || 0);
  }
  return s;
}

export function computeWindowState(
  rule: AttendanceRule | null,
  today: AttendanceRecord | null,
  now: Date,
): PunchWindowState | null {
  if (!rule) return null;
  const workStartM = hmToMinSafe(rule.work_start, 9 * 60);
  const overnight = isOvernightRule(rule);
  const nowM = linearizeNow(riyadhNowMinutes(now), workStartM, overnight);
  const workEndM = hmToMinSafe(rule.work_end, 17 * 60) + (overnight ? 1440 : 0);
  const checkinStart = rule.flex_enabled
    ? hmToMinSafe(rule.early_window_start, workStartM - (rule.checkin_window_before_min ?? 60))
    : workStartM - (rule.checkin_window_before_min ?? 60);
  const checkinEnd = rule.flex_enabled
    ? hmToMinSafe(rule.late_window_end, workStartM + (rule.checkin_window_after_min ?? 120))
    : workStartM + (rule.checkin_window_after_min ?? 120);
  const checkoutStart = workEndM - (rule.checkout_window_before_min ?? 60);
  const checkoutEnd = workEndM + (rule.checkout_window_after_min ?? 60);

  const checkin_window = { start: fmtHM(checkinStart), end: fmtHM(checkinEnd) };
  const checkout_window = { start: fmtHM(checkoutStart), end: fmtHM(checkoutEnd) };

  if (today?.check_out_at) {
    // Multiple check-outs within the eligible window are legitimate
    // (last-out-wins — see attendance_punches / logPunch). But once the
    // window has actually closed we must lock — otherwise the "تسجيل
    // انصراف جديد" button stays visible for hours after it closed.
    const canRepunch = nowM >= checkoutStart && nowM <= checkoutEnd;
    return {
      phase: "done",
      action: "none",
      can_act: canRepunch,
      opens_at: null,
      closes_at: canRepunch ? todayIsoAt(now, checkoutEnd) : null,
      checkin_window,
      checkout_window,
    };
  }
  if (!today?.check_in_at) {
    if (nowM < checkinStart) {
      return {
        phase: "before_checkin",
        action: "check_in",
        can_act: false,
        opens_at: todayIsoAt(now, checkinStart),
        closes_at: todayIsoAt(now, checkinEnd),
        checkin_window,
        checkout_window,
      };
    }
    if (nowM <= checkinEnd) {
      return {
        phase: "checkin_open",
        action: "check_in",
        can_act: true,
        opens_at: null,
        closes_at: todayIsoAt(now, checkinEnd),
        checkin_window,
        checkout_window,
      };
    }
    return {
      phase: "checkin_missed",
      action: "check_in",
      can_act: false,
      opens_at: null,
      closes_at: null,
      checkin_window,
      checkout_window,
    };
  }
  // Checked in, not out
  if (nowM < checkoutStart) {
    return {
      phase: "working",
      action: "none",
      can_act: false,
      opens_at: todayIsoAt(now, checkoutStart),
      closes_at: todayIsoAt(now, checkoutEnd),
      checkin_window,
      checkout_window,
    };
  }
  if (nowM <= checkoutEnd) {
    return {
      phase: "checkout_open",
      action: "check_out",
      can_act: true,
      opens_at: null,
      closes_at: todayIsoAt(now, checkoutEnd),
      checkin_window,
      checkout_window,
    };
  }
  return {
    phase: "checkout_late",
    action: "check_out",
    can_act: true,
    opens_at: null,
    closes_at: null,
    checkin_window,
    checkout_window,
  };
}

// ---------------- attendance-correction parsing ----------------

export const CORRECTION_PREFIX_RE = /^\[attendance_correction(?::([0-9a-f-]{36}))?\]\s*/i;

export function parseCorrection(row: any): CorrectionInfo | null {
  const m = CORRECTION_PREFIX_RE.exec(row.reason ?? "");
  if (!m) return null;
  const cleaned = (row.reason as string).replace(CORRECTION_PREFIX_RE, "");
  const dashIdx = cleaned.indexOf("—");
  return {
    permission_id: row.id,
    record_id: m[1] ?? null,
    work_date: row.request_date,
    status: row.status as CorrectionStatus,
    suggested_check_in: (row.from_time ?? "").slice(0, 5),
    suggested_check_out: (row.to_time ?? "").slice(0, 5),
    reason: dashIdx >= 0 ? cleaned.slice(dashIdx + 1).trim() : cleaned.trim(),
    review_note: row.review_note ?? null,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? null,
  };
}

export const HISTORY_FIELDS = [
  "check_in_at",
  "check_out_at",
  "status",
  "late_minutes",
  "late_deduction_amount",
  "early_leave_minutes",
  "early_leave_deduction_amount",
  "notes",
] as const;

export const fmtVal = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return String(v);
  return String(v);
};

export const CAPABILITY_BY_ACTION: Record<string, string> = {
  admin_edit_attendance: "attendance_edit",
  review_attendance_correction: "attendance_correction_review",
};

/** Physical presses are logged unlimited, but throttled per employee. */
export const PUNCH_COOLDOWN_SECONDS = 120;
