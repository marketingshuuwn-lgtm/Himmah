// Pure, framework-free helpers that turn an attendance record + its rule
// into a step-by-step deduction breakdown the employee can read.
//
// Used by DeductionExplainDialog on each row and by the "impact preview"
// inside RequestTimeAdjustmentDialog. Also unit-tested from Playwright.

import type { AttendanceRule, AttendanceStatus } from "@/lib/hr/attendance-core";
import { lateDeductionBreakdown, dailyRateFor } from "@/lib/hr/deduction-engine";

export interface ExplainInput {
  status: AttendanceStatus | string;
  /** Late minutes counted after the grace window; 0 if within grace. */
  lateMinutes: number;
  /** Deduction already recorded (SAR). */
  deduction: number;
  /** Optional monthly base salary — used to derive daily rate for context. */
  baseSalary?: number | null;
  /** Early-leave minutes (after the early-leave grace); 0 when on time/disabled. */
  earlyLeaveMinutes?: number;
  /** Early-leave deduction already recorded (SAR). */
  earlyLeaveDeduction?: number;
}

export interface ExplainStep {
  label: string;
  detail?: string;
  value?: string;
  tone?: "muted" | "positive" | "negative" | "warning";
}

export interface Explanation {
  headline: string;
  steps: ExplainStep[];
  totalDeduction: number;
  dailyRate: number | null;
  status: string;
}

const fmtMoney = (n: number) =>
  `${n.toFixed(2).replace(/\.00$/, "")} SAR`;

const fmtMin = (n: number) => `${n} min`;

export function buildExplanation(
  rule: AttendanceRule | null,
  input: ExplainInput,
): Explanation {
  const steps: ExplainStep[] = [];
  const status = input.status;
  const late = Math.max(0, Math.round(input.lateMinutes || 0));
  const deduction = Math.max(0, Number(input.deduction || 0));
  const grace = rule?.late_grace_minutes ?? 0;
  const earlyMin = Math.max(0, Math.round(input.earlyLeaveMinutes || 0));
  const earlyDed = Math.max(0, Number(input.earlyLeaveDeduction || 0));
  const earlyEnabled = !!rule?.early_leave_deduction_enabled;
  const perMin = Number(rule?.late_deduction_per_minute || 0);
  const baseSalary = input.baseSalary ?? null;
  // Shared daily-wage definition (base ÷ 30, or the flat rule amount).
  const rawDaily = dailyRateFor(rule, baseSalary);
  const dailyRate = rawDaily > 0 ? rawDaily : null;


  /** Appends the early-leave block (opt-in per rule) and returns its amount. */
  function pushEarlyLeave(): number {
    if (!earlyEnabled) return 0;
    const eGrace = Number(rule?.early_leave_grace_minutes || 0);
    const ePerMin = Number(rule?.early_leave_deduction_per_minute || 0);
    steps.push({
      label: "Early-leave grace",
      detail:
        eGrace > 0
          ? `Leaving up to ${eGrace} min before end time is not deducted.`
          : "No early-leave grace configured.",
      value: fmtMin(eGrace),
      tone: "muted",
    });
    if (earlyMin <= 0) {
      steps.push({
        label: "Left on time",
        detail: `Official end time ${rule?.work_end ?? "—"} — no early-leave deduction.`,
        value: fmtMoney(0),
        tone: "positive",
      });
      return 0;
    }
    steps.push({
      label: "Early leave beyond grace",
      detail: `${ePerMin} SAR × ${earlyMin} min (before ${rule?.work_end ?? "—"})`,
      value: fmtMoney(earlyDed),
      tone: "negative",
    });
    return earlyDed;
  }

  steps.push({
    label: "Official start time",
    value: rule?.work_start ?? "—",
    tone: "muted",
  });
  steps.push({
    label: "Grace period",
    detail:
      grace > 0
        ? `Any arrival within ${grace} min of start time is on-time.`
        : "No grace period configured.",
    value: fmtMin(grace),
    tone: "muted",
  });

  if (status === "absent") {
    steps.push({
      label: "Absence deduction",
      detail:
        rule?.absence_calc_mode === "fixed_amount"
          ? `Fixed daily amount from rule.`
          : `Daily rate = base salary ÷ 30.`,
      value: dailyRate != null ? fmtMoney(dailyRate) : fmtMoney(deduction),
      tone: "negative",
    });
    const eAbs = pushEarlyLeave();
    return {
      headline: "Absent — full day deducted",
      steps,
      totalDeduction: deduction + eAbs,
      dailyRate,
      status: String(status),
    };
  }

  if (status === "half_day") {
    steps.push({
      label: "Exceeded flex-late window",
      detail: `Late minutes after start: ${late}. Beyond the flex window → half-day penalty applies.`,
      value: fmtMin(late),
      tone: "warning",
    });
    steps.push({
      label: "Half-day deduction",
      value: fmtMoney(deduction),
      tone: "negative",
    });
    const eHalf = pushEarlyLeave();
    return {
      headline: "Half-day — flex window exceeded",
      steps,
      totalDeduction: deduction + eHalf,
      dailyRate,
      status: String(status),
    };
  }

  if (late <= 0 || status === "present" || status === "early") {
    steps.push({
      label: "Within grace",
      detail: "Arrival was on-time or inside the grace window — no deduction.",
      value: fmtMoney(0),
      tone: "positive",
    });
    const eOk = pushEarlyLeave();
    return {
      headline: eOk > 0 ? `Early leave by ${earlyMin} min` : "On-time — no deduction",
      steps,
      totalDeduction: eOk,
      dailyRate,
      status: String(status),
    };
  }

  // Late path
  steps.push({
    label: "Late beyond grace",
    detail: `Counted lateness (minutes past start after subtracting grace effect).`,
    value: fmtMin(late),
    tone: "warning",
  });

  // Same formula the punch-time classifier used — never a parallel copy.
  const lateBreak = lateDeductionBreakdown(late, rule);
  if (lateBreak.tier) {
    steps.push({
      label: `Tier ${lateBreak.tier.from}–${lateBreak.tier.to} min`,
      detail: `Rate ${lateBreak.tier.rate} SAR × ${late} min`,
      value: fmtMoney(lateBreak.amount),
      tone: "negative",
    });
  } else if (perMin > 0) {
    steps.push({
      label: "Per-minute rate",
      detail: `${perMin} SAR × ${late} min`,
      value: fmtMoney(lateBreak.amount),
      tone: "negative",
    });
  }

  const eLate = pushEarlyLeave();

  steps.push({
    label: "Total deduction",
    value: fmtMoney(deduction + eLate),
    tone: "negative",
  });

  return {
    headline: `Late by ${late} min`,
    steps,
    totalDeduction: deduction + eLate,
    dailyRate,
    status: String(status),
  };
}
