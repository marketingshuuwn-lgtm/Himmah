// Timezone-safe date/time helpers pinned to Asia/Riyadh (UTC+3, no DST).
// Fixes: server-local `getHours()` / `toISOString().slice(0,10)` usage that
// misclassifies check-ins and shifts `work_date` when the server runs in UTC.

export const APP_TZ = "Asia/Riyadh";
const TZ_OFFSET = "+03:00";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export interface RiyadhParts {
  /** YYYY-MM-DD in Riyadh wall-clock */
  date: string;
  /** Minutes since midnight in Riyadh wall-clock */
  minutes: number;
}

export function riyadhParts(now: Date = new Date()): RiyadhParts {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(now)) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour; // some engines emit 24:00
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(hour) * 60 + Number(map.minute),
  };
}

/** HH:MM in Riyadh wall-clock for an arbitrary ISO instant. */
export function riyadhHM(iso: string): string {
  const { minutes } = riyadhParts(new Date(iso));
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Today's date (YYYY-MM-DD) in Riyadh — use for `work_date` and period math. */
export function riyadhToday(now: Date = new Date()): string {
  return riyadhParts(now).date;
}

/** Minutes since midnight in Riyadh — use for HH:MM rule comparisons. */
export function riyadhNowMinutes(now: Date = new Date()): number {
  return riyadhParts(now).minutes;
}

/** ISO instant for a specific date's Riyadh wall-clock at `minutes` (for past/future dates, unlike riyadhIsoAt which anchors to "now"'s date). */
export function riyadhIsoAtDate(dateStr: string, minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${TZ_OFFSET}`).toISOString();
}

/** ISO instant corresponding to today's Riyadh wall-clock at `minutes`. */
export function riyadhIsoAt(minutes: number, now: Date = new Date()): string {
  const { date } = riyadhParts(now);
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:00${TZ_OFFSET}`).toISOString();
}

// ---------- Pure date-string helpers (no timezone involved) ----------

/** Day of week for YYYY-MM-DD (0=Sun … 6=Sat). */
export function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** KSA weekend: Friday (5) and Saturday (6). */
export function isWeekend(dateStr: string): boolean {
  const d = dowOf(dateStr);
  return d === 5 || d === 6;
}

/** All dates (YYYY-MM-DD) of the month containing periodMonth (YYYY-MM-01). */
export function datesOfMonth(periodMonth: string): string[] {
  const [y, m] = periodMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-`;
  const out: string[] = [];
  for (let d = 1; d <= lastDay; d++) out.push(prefix + String(d).padStart(2, "0"));
  return out;
}

/** Inclusive range of dates between two YYYY-MM-DD strings (capped at maxDays). */
export function datesInRange(start: string, end: string, maxDays = 400): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last && out.length < maxDays) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Last date (YYYY-MM-DD) of the month containing periodMonth. */
export function lastDateOfMonth(periodMonth: string): string {
  const all = datesOfMonth(periodMonth);
  return all[all.length - 1];
}

/** First date (YYYY-MM-DD) of the month following periodMonth. */
export function nextMonthStart(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/**
 * Leave days that actually consume balance: calendar range minus Fri/Sat.
 * Mirrors exactly what the approve_leave_request RPC marks as "leave" in
 * attendance, so the balance and the attendance calendar can't disagree.
 */
export function countLeaveDays(start: string, end: string): number {
  return datesInRange(start, end).filter((d) => !isWeekend(d)).length;
}
