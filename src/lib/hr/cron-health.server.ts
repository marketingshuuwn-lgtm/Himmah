/**
 * Cron health helpers. Kept out of the server-function module so
 * `cron-health.functions.ts` stays a thin wrapper (see attendance-core.ts).
 */

export const CRON_JOB_LABELS: Record<string, { label: string; expected: string }> = {
  cron_checkin_reminder: { label: "تذكير تسجيل الحضور", expected: "كل يوم عمل ٩:٣٠ ص" },
  cron_checkout_reminder: { label: "تذكير تسجيل الانصراف", expected: "كل يوم عمل ٦:٠٠ م" },
  cron_auto_close: { label: "إغلاق الجلسات المفتوحة", expected: "كل ليلة ٩:٣٠ م" },
  monthly_generate: { label: "توليد الرواتب الشهرية", expected: "يوم ٢٥ من كل شهر" },
};

export interface CronHealthRow {
  action: string;
  label: string;
  expected: string;
  last_run_at: string | null;
  /** Hours since the last recorded run (null when it never ran). */
  hours_since: number | null;
  status: "ok" | "stale" | "never";
}

/** Staleness thresholds in hours, per job. */
const STALE_AFTER_HOURS: Record<string, number> = {
  cron_checkin_reminder: 96,
  cron_checkout_reminder: 96,
  cron_auto_close: 48,
  monthly_generate: 24 * 40,
};

export function buildCronHealth(
  rows: Array<{ action: string; created_at: string }>,
  now: Date = new Date(),
): CronHealthRow[] {
  const lastByAction = new Map<string, string>();
  for (const r of rows) {
    const prev = lastByAction.get(r.action);
    if (!prev || r.created_at > prev) lastByAction.set(r.action, r.created_at);
  }
  return Object.entries(CRON_JOB_LABELS).map(([action, meta]) => {
    const last = lastByAction.get(action) ?? null;
    if (!last) {
      return { action, ...meta, last_run_at: null, hours_since: null, status: "never" as const };
    }
    const hours = (now.getTime() - new Date(last).getTime()) / 3_600_000;
    return {
      action,
      ...meta,
      last_run_at: last,
      hours_since: Math.round(hours * 10) / 10,
      status: hours > (STALE_AFTER_HOURS[action] ?? 48) ? ("stale" as const) : ("ok" as const),
    };
  });
}
