// Unified contract-field registry.
//
// Every {{variable}} that can appear in a contract template belongs to
// exactly one *owner*:
//
//   profile  — already exists in the employee's record; filled automatically
//              and never re-typed by anyone.
//   hr       — business data only the administration decides (salary grade,
//              probation length, project name…).
//   employee — personal data only the employee can supply (address, phone,
//              emergency contact…). Requested from them in "عقودي".
//   system   — generated (today's date, reference…).
//
// HR can override the owner of any variable per-template; the registry is
// only the default so most templates need zero configuration.

import { isAutoContractVar } from "@/lib/hr/contract-autofill";

export type FieldSource = "profile" | "hr" | "employee" | "system";
export type FieldKind = "text" | "textarea" | "date" | "number" | "iban" | "id" | "phone";

export interface FieldMeta {
  label: string;
  source: FieldSource;
  kind: FieldKind;
  /** Employee-supplied values that should be written back to their profile. */
  profileColumn?: "national_id" | "iban" | "bank_name";
}

export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  profile: "تلقائي من ملف الموظف",
  hr: "تعبّئه الإدارة",
  employee: "يعبّئه الموظف",
  system: "تلقائي من النظام",
};

const P = (label: string, kind: FieldKind = "text"): FieldMeta => ({
  label,
  source: "profile",
  kind,
});
const E = (label: string, kind: FieldKind = "text", profileColumn?: FieldMeta["profileColumn"]) => ({
  label,
  source: "employee" as const,
  kind,
  ...(profileColumn ? { profileColumn } : {}),
});
const H = (label: string, kind: FieldKind = "text"): FieldMeta => ({ label, source: "hr", kind });

export const FIELD_REGISTRY: Record<string, FieldMeta> = {
  // --- from the employee record (auto) ---
  employee_name: P("اسم الموظف"),
  full_name: P("الاسم الكامل"),
  name: P("الاسم"),
  employee_no: P("الرقم الوظيفي"),
  employee_number: P("الرقم الوظيفي"),
  employee_id: P("الرقم الوظيفي"),
  position: P("المسمى الوظيفي"),
  job_title: P("المسمى الوظيفي"),
  title: P("المسمى الوظيفي"),
  department: P("القسم"),
  department_name: P("القسم"),
  hire_date: P("تاريخ التعيين", "date"),
  start_date: P("تاريخ المباشرة", "date"),
  join_date: P("تاريخ الالتحاق", "date"),
  national_id: P("رقم الهوية", "id"),
  id_number: P("رقم الهوية", "id"),
  iban: P("رقم الآيبان", "iban"),
  bank_iban: P("رقم الآيبان", "iban"),
  bank_name: P("اسم البنك"),
  bank: P("اسم البنك"),
  salary: P("الراتب الأساسي", "number"),
  base_salary: P("الراتب الأساسي", "number"),
  basic_salary: P("الراتب الأساسي", "number"),
  allowances: P("البدلات", "number"),
  allowance: P("البدلات", "number"),
  total_salary: P("إجمالي الراتب", "number"),

  // --- system ---
  date: { label: "تاريخ التحرير", source: "system", kind: "date" },
  contract_date: { label: "تاريخ العقد", source: "system", kind: "date" },
  today: { label: "تاريخ اليوم", source: "system", kind: "date" },

  // --- employee-supplied personal data ---
  phone: E("رقم الجوال", "phone"),
  mobile: E("رقم الجوال", "phone"),
  personal_email: E("البريد الشخصي"),
  address: E("العنوان الوطني", "textarea"),
  home_address: E("عنوان السكن", "textarea"),
  city: E("المدينة"),
  emergency_contact: E("جهة الاتصال للطوارئ"),
  emergency_phone: E("جوال الطوارئ", "phone"),
  marital_status: E("الحالة الاجتماعية"),
  nationality: E("الجنسية"),
  birth_date: E("تاريخ الميلاد", "date"),
  passport_no: E("رقم جواز السفر", "id"),
  qualification: E("المؤهل العلمي"),

  // --- HR/business data ---
  probation_period: H("فترة التجربة"),
  contract_duration: H("مدة العقد"),
  end_date: H("تاريخ الانتهاء", "date"),
  working_hours: H("ساعات العمل"),
  annual_leave_days: H("أيام الإجازة السنوية", "number"),
  notice_period: H("مدة الإشعار"),
  work_location: H("مقر العمل"),
  manager_name: H("اسم المدير المباشر"),
  project_name: H("اسم المشروع"),
};

/** Owner of a variable, honouring a per-template override. */
export function fieldSource(
  name: string,
  overrides?: Record<string, FieldSource> | null,
): FieldSource {
  const o = overrides?.[name];
  if (o) return o;
  const meta = FIELD_REGISTRY[name];
  if (meta) return meta.source;
  return isAutoContractVar(name) ? "profile" : "hr";
}

export function fieldLabel(name: string): string {
  return FIELD_REGISTRY[name]?.label ?? name;
}

export function fieldKind(name: string): FieldKind {
  return FIELD_REGISTRY[name]?.kind ?? "text";
}

export function fieldProfileColumn(name: string): FieldMeta["profileColumn"] {
  return FIELD_REGISTRY[name]?.profileColumn;
}

/** Variables the employee themself must fill for a given template body. */
export function employeeOwnedFields(
  names: string[],
  overrides?: Record<string, FieldSource> | null,
): string[] {
  return names.filter((n) => fieldSource(n, overrides) === "employee");
}

/**
 * Template `variables` is stored as JSONB and historically held a plain
 * string[]. It now also accepts [{ name, source }] so HR can retag a field.
 * Both shapes are read here so old templates keep working untouched.
 */
export function parseVariableSpecs(
  raw: unknown,
): { names: string[]; sources: Record<string, FieldSource> } {
  const names: string[] = [];
  const sources: Record<string, FieldSource> = {};
  if (!Array.isArray(raw)) return { names, sources };
  for (const item of raw) {
    if (typeof item === "string") {
      names.push(item);
    } else if (item && typeof item === "object" && typeof (item as any).name === "string") {
      const n = (item as any).name as string;
      names.push(n);
      const s = (item as any).source as FieldSource | undefined;
      if (s && ["profile", "hr", "employee", "system"].includes(s)) sources[n] = s;
    }
  }
  return { names, sources };
}

/** Serialises back to the JSONB shape (objects only when a source is set). */
export function serializeVariableSpecs(
  names: string[],
  sources: Record<string, FieldSource>,
): Array<string | { name: string; source: FieldSource }> {
  return names.map((n) => (sources[n] ? { name: n, source: sources[n] } : n));
}
