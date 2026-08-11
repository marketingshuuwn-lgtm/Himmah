// Best-effort field extraction from an uploaded contract text file
// (.txt, .md, or any plain-text export). We scan for common English +
// Arabic labels for the variable names in AUTO_VAR_SOURCES so HR can drop
// in a previous contract and auto-fill everything the new template asks
// for — no re-typing values that already exist in writing.
//
// Deliberately conservative: only assigns a value when a labelled match
// is found. Never overwrites a value the user has already typed.

const ALIASES: Record<string, string[]> = {
  employee_name: ["employee name", "name", "الاسم", "اسم الموظف", "اسم"],
  full_name: ["full name", "الاسم الكامل"],
  employee_no: ["employee no", "employee number", "رقم الموظف", "الرقم الوظيفي"],
  position: ["position", "job title", "title", "المسمى الوظيفي", "الوظيفة"],
  department: ["department", "القسم", "الإدارة"],
  hire_date: ["hire date", "start date", "join date", "تاريخ التعيين", "تاريخ المباشرة"],
  effective_date: ["effective date", "تاريخ السريان", "تاريخ النفاذ"],
  national_id: ["national id", "id number", "iqama", "الهوية", "رقم الهوية", "الإقامة"],
  iban: ["iban", "الآيبان", "رقم الآيبان"],
  bank_name: ["bank", "bank name", "البنك", "اسم البنك"],
  salary: ["salary", "basic salary", "base salary", "الراتب", "الراتب الأساسي"],
  base_salary: ["base salary", "basic salary", "الراتب الأساسي"],
  allowances: ["allowances", "allowance", "البدلات", "البدل"],
  total_salary: ["total salary", "gross salary", "إجمالي الراتب", "الراتب الإجمالي"],
};

function extractOne(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // "Label: value" or "Label = value" up to end-of-line
    const re = new RegExp(`${esc}\\s*[:：=\\-]\\s*([^\\n\\r]+)`, "i");
    const m = text.match(re);
    if (m) {
      const val = m[1].trim().replace(/[،,;].*$/, "").trim();
      if (val.length > 0 && val.length < 200) return val;
    }
  }
  return null;
}

export function extractContractFields(text: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const labels = ALIASES[key] ?? [key.replace(/_/g, " ")];
    const v = extractOne(text, labels);
    if (v) out[key] = v;
  }
  return out;
}

/** Reads a File as UTF-8 text. Works for .txt/.md/.csv; PDFs/DOCX will
 *  return garbled bytes — caller shows a hint to paste text instead. */
export async function readFileAsText(file: File): Promise<string> {
  try {
    return await file.text();
  } catch {
    return "";
  }
}
