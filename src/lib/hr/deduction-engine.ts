/**
 * Deduction engine — the single, framework-free source of truth for turning
 * attendance facts (late minutes, early-leave minutes, half day, absence)
 * into money.
 *
 * Every consumer goes through this module:
 *  - `attendance.functions.ts`  → classification at punch time
 *  - `attendance-explain.ts`    → the employee-facing breakdown
 *  - `payroll-engine.ts`        → monthly payroll (absence helpers re-exported)
 *  - the auto-close cron        → half-day flagging
 *
 * Keeping the formulas here is what prevents the historical drift where the
 * same "minutes × rate" rule existed in three slightly different variants.
 */

export interface DeductionTier {
  from: number;
  to: number;
  rate: number;
}

/**
 * Structural subset of `AttendanceRule`. Declared locally (instead of
 * importing the type) so this module stays free of any dependency on the
 * server-function file and can be unit-tested in isolation.
 */
export interface DeductionRuleLike {
  late_deduction_per_minute?: number | string | null;
  tiered_late_deduction?: DeductionTier[] | null;
  half_day_deduction?: number | string | null;
  early_leave_deduction_enabled?: boolean | null;
  early_leave_grace_minutes?: number | string | null;
  early_leave_deduction_per_minute?: number | string | null;
  absence_calc_mode?: "salary_per_30" | "fixed_amount" | null;
  absence_deduction?: number | string | null;
}

const num = (v: unknown) => Number(v || 0);

/** Tier whose bracket contains `minutes`, or null when none matches. */
export function matchTier(minutes: number, tiers?: DeductionTier[] | null): DeductionTier | null {
  if (!tiers?.length) return null;
  return tiers.find((t) => minutes >= Number(t.from) && minutes <= Number(t.to)) ?? null;
}

export interface DeductionBreakdown {
  amount: number;
  /** Rate actually applied, SAR per minute. */
  perMinute: number;
  /** Set when a configured tier matched, so the UI can name the bracket. */
  tier: DeductionTier | null;
}

/**
 * Late deduction. Tiered table wins when a bracket matches the lateness;
 * otherwise the flat per-minute rate applies. The rate is always applied to
 * the FULL lateness (not just the minutes inside the bracket) — that is the
 * behaviour the rules UI documents.
 */
export function lateDeductionBreakdown(
  lateMinutes: number,
  rule: DeductionRuleLike | null,
): DeductionBreakdown {
  const minutes = Math.max(0, Math.round(lateMinutes || 0));
  if (!rule || minutes <= 0) return { amount: 0, perMinute: 0, tier: null };
  const tier = matchTier(minutes, rule.tiered_late_deduction);
  const perMinute = tier ? Number(tier.rate) : num(rule.late_deduction_per_minute);
  return { amount: perMinute * minutes, perMinute, tier };
}

export function lateDeductionFor(lateMinutes: number, rule: DeductionRuleLike | null): number {
  return lateDeductionBreakdown(lateMinutes, rule).amount;
}

/**
 * Early-leave deduction — mirrors the late path (same tier-then-per-minute
 * shape) so the two sides of the day stay symmetric. Always 0 while the
 * per-rule toggle is off.
 */
export function earlyLeaveDeductionBreakdown(
  earlyMinutes: number,
  rule: DeductionRuleLike | null,
): DeductionBreakdown {
  const minutes = Math.max(0, Math.round(earlyMinutes || 0));
  if (!rule || !rule.early_leave_deduction_enabled || minutes <= 0) {
    return { amount: 0, perMinute: 0, tier: null };
  }
  const perMinute = num(rule.early_leave_deduction_per_minute);
  return { amount: perMinute * minutes, perMinute, tier: null };
}

export function earlyLeaveDeductionFor(
  earlyMinutes: number,
  rule: DeductionRuleLike | null,
): number {
  return earlyLeaveDeductionBreakdown(earlyMinutes, rule).amount;
}

/** Half-day penalty (flex window exceeded, or an auto-closed orphan session). */
export function halfDayDeductionFor(rule: DeductionRuleLike | null): number {
  return num(rule?.half_day_deduction);
}

/** Daily wage used for absence: base ÷ 30 (Saudi standard) or a flat rule amount. */
export function dailyRateFor(rule: DeductionRuleLike | null, baseSalary?: number | null): number {
  if (rule?.absence_calc_mode === "fixed_amount") return num(rule.absence_deduction);
  return baseSalary && baseSalary > 0 ? baseSalary / 30 : 0;
}

// Absence lives in payroll-engine (it needs the calendar helpers); re-exported
// here so callers only ever import one deduction module.
export {
  EXCUSED_OR_PRESENT,
  countAbsenceDays,
  absenceDeductionFor,
} from "@/lib/hr/payroll-engine";
