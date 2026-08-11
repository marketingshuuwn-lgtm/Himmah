// Shared mapping from contract template variable names to employee-profile
// fields. Used by BOTH contract-creation flows (the modal dialog in
// contracts.tsx and the standalone wizard in contracts.new.tsx) so the
// definition of "which variables are auto-filled from the employee's real
// record" can never drift between the two entry points.
//
// The mapping is deliberately generous with aliases (English + Arabic-ish
// snake_case) so HR-authored templates rarely need re-editing — any
// registration data that already exists in the employee's profile is used
// verbatim and never asked for a second time.

import type { EmployeeProfile } from "@/lib/hr/profile.functions";
import { fmtDate } from "@/lib/utils/format";

const num = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? "" : String(Number(n));

export const AUTO_VAR_SOURCES: Record<string, (p: EmployeeProfile) => string> = {
  // Identity
  employee_name: (p) => p.full_name,
  full_name: (p) => p.full_name,
  name: (p) => p.full_name,
  employee_no: (p) => p.employee_no ?? "",
  employee_number: (p) => p.employee_no ?? "",
  employee_id: (p) => p.employee_no ?? "",

  // Job
  position: (p) => p.position,
  job_title: (p) => p.position,
  title: (p) => p.position,
  department: (p) => p.department_name ?? "",
  department_name: (p) => p.department_name ?? "",

  // Dates
  hire_date: (p) => fmtDate(p.hire_date),
  start_date: (p) => fmtDate(p.hire_date),
  join_date: (p) => fmtDate(p.hire_date),
  date: () => fmtDate(new Date().toISOString()),
  contract_date: () => fmtDate(new Date().toISOString()),
  today: () => fmtDate(new Date().toISOString()),

  // Identification & banking (financials — only fill when caller can see them)
  national_id: (p) => p.financials?.national_id ?? "",
  id_number: (p) => p.financials?.national_id ?? "",
  iban: (p) => p.financials?.iban ?? "",
  bank_iban: (p) => p.financials?.iban ?? "",
  bank_name: (p) => p.financials?.bank_name ?? "",
  bank: (p) => p.financials?.bank_name ?? "",

  // Compensation (default from current record — HR can still override in
  // the structured Salary panel; the interpolated body reflects whatever
  // the user last typed in the dialog).
  salary: (p) => num(p.financials?.base_salary),
  base_salary: (p) => num(p.financials?.base_salary),
  basic_salary: (p) => num(p.financials?.base_salary),
  allowances: (p) => num(p.financials?.allowances),
  allowance: (p) => num(p.financials?.allowances),
  total_salary: (p) =>
    num((p.financials?.base_salary ?? 0) + (p.financials?.allowances ?? 0)),
};

export function isAutoContractVar(key: string): boolean {
  return key in AUTO_VAR_SOURCES;
}

/** Applies auto-fill to every variable key that maps to a known employee field. */
export function applyAutoContractVars(
  keys: string[],
  profile: EmployeeProfile | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    out[k] = isAutoContractVar(k) && profile ? AUTO_VAR_SOURCES[k](profile) : "";
  }
  return out;
}

/**
 * Interpolates {{var}} placeholders in a contract body/title with the
 * supplied values. Missing values leave the placeholder visible so the
 * author immediately sees what's still unfilled — better than a silently
 * broken contract.
 */
export function interpolateContract(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v && v.length > 0
      ? v
      : `<span class="bg-amber-100 text-amber-900 px-1 rounded">{{${key}}}</span>`;
  });
}

/** Returns every unique {{placeholder}} key found in a contract body. */
export function extractPlaceholders(body: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) set.add(m[1]);
  return Array.from(set);
}

/**
 * Placeholder keys that are still unfilled — either not present in
 * `vars` or an empty/whitespace-only string. Used by both the UI (to
 * warn the author) and the server (to hard-block send/sign of an
 * incomplete contract).
 */
export function unfilledPlaceholders(
  body: string,
  vars: Record<string, string> = {},
): string[] {
  return extractPlaceholders(body).filter((k) => {
    const v = vars[k];
    return !v || String(v).trim().length === 0;
  });
}

/** Unified guard message reused by client and server. */
export function contractIncompleteMessage(missing: string[]): string {
  return `العقد غير مكتمل — الحقول الناقصة: ${missing.join("، ")}`;
}
