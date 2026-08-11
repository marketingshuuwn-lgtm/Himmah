// Force Latin (English) digits & Gregorian dates everywhere in the app.

const NF = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const NF_INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const NF_CUR = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtNum = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "0" : NF.format(Number(n));

export const fmtInt = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "0" : NF_INT.format(Number(n));

export const fmtMoney = (n: number | string | null | undefined) =>
  `${NF_CUR.format(Number(n ?? 0))} ر.س`;

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const fmtTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const fmtTimeWithSeconds = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

export const fmtDayShort = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // Weekday in Arabic, day & month in Gregorian English digits
  const wd = new Intl.DateTimeFormat("ar", { weekday: "short" }).format(date);
  const dm = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
  return `${wd} · ${dm}`;
};

export const fmtMonthLabel = (period: string) => {
  // period: YYYY-MM-01
  const d = new Date(period);
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(d);
};

export const monthKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
