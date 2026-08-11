/**
 * Server-only SIF/CSV builders.
 * KSA WPS layout (simplified for SIF export): pipe-delimited records
 * matching common Saudi bank uploaders (Establishment header + employee records).
 * The exact bank template varies; this generic version includes the fields
 * every WPS-compliant bank requires and can be tuned per bank.
 */

export interface OrgSettings {
  establishment_name: string;
  employer_id: string;
  bank_code: string;
  bank_name: string;
  iban: string;
}

export interface SifEmployeeRow {
  employee_no: string;
  full_name: string;
  national_id: string;
  iban: string;
  bank_name: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  net_salary: number;
}

const pad = (v: string | number, n: number, ch = " ", right = false) => {
  const s = String(v ?? "");
  if (s.length >= n) return s.slice(0, n);
  return right ? s + ch.repeat(n - s.length) : ch.repeat(n - s.length) + s;
};

function fmtAmount(n: number) {
  return (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
}

export function buildKsaWpsSif(opts: {
  org: OrgSettings;
  periodMonth: string; // YYYY-MM-01
  employees: SifEmployeeRow[];
}) {
  const period = opts.periodMonth.slice(0, 7).replace("-", "");
  const total = opts.employees.reduce((s, e) => s + Number(e.net_salary || 0), 0);
  const lines: string[] = [];

  // Header record (type EH)
  lines.push([
    "EH",
    pad(opts.org.employer_id, 20, " ", true),
    pad(opts.org.establishment_name, 60, " ", true),
    pad(opts.org.bank_code, 8, " ", true),
    pad(opts.org.iban, 24, " ", true),
    period,
    pad(opts.employees.length, 6, "0"),
    pad(fmtAmount(total), 18),
  ].join("|"));

  // Employee records (type ER)
  for (const e of opts.employees) {
    lines.push([
      "ER",
      pad(e.employee_no, 10, " ", true),
      pad(e.full_name, 60, " ", true),
      pad(e.national_id, 12, " ", true),
      pad(e.bank_name, 30, " ", true),
      pad(e.iban, 24, " ", true),
      pad(fmtAmount(e.base_salary), 14),
      pad(fmtAmount(e.allowances), 14),
      pad(fmtAmount(e.deductions), 14),
      pad(fmtAmount(e.net_salary), 14),
    ].join("|"));
  }

  // Trailer (type ET)
  lines.push([
    "ET",
    pad(opts.employees.length, 6, "0"),
    pad(fmtAmount(total), 18),
  ].join("|"));

  return lines.join("\r\n") + "\r\n";
}

export function buildAttendanceCsv(rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return "\uFEFF" + lines.join("\r\n"); // BOM for Excel
}
