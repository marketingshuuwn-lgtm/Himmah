import * as XLSX from "xlsx";

export function downloadAttendanceTemplate() {
  const headers = ["employee_no", "work_date", "check_in_at", "check_out_at", "status", "late_minutes", "notes"];
  const example = ["EMP001", "2026-07-10", "08:00", "17:00", "present", 0, ""];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const instructions = XLSX.utils.aoa_to_sheet([
    ["العمود", "الوصف", "قيم مسموحة / مثال"],
    ["employee_no", "الرقم الوظيفي للموظف", "EMP001"],
    ["work_date", "تاريخ اليوم", "YYYY-MM-DD"],
    ["check_in_at", "وقت الحضور (اختياري)", "HH:mm — مثال 08:00"],
    ["check_out_at", "وقت الانصراف (اختياري)", "HH:mm"],
    ["status", "حالة اليوم", "present / late / absent / on_leave"],
    ["late_minutes", "دقائق التأخير", "رقم صحيح موجب"],
    ["notes", "ملاحظات (اختياري)", "نص حر"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.utils.book_append_sheet(wb, instructions, "التعليمات");
  XLSX.writeFile(wb, "attendance_template.xlsx");
}

export function downloadEmployeesTemplate() {
  const headers = ["employee_no", "full_name", "email", "position", "department_name", "hire_date", "base_salary", "allowances", "status"];
  const example = ["EMP001", "أحمد محمد", "ahmed@example.com", "محاسب", "المالية", "2026-01-01", 8000, 1500, "active"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  const instructions = XLSX.utils.aoa_to_sheet([
    ["العمود", "الوصف", "قيم مسموحة / مثال"],
    ["employee_no", "رقم وظيفي فريد", "EMP001"],
    ["full_name", "الاسم الكامل", "نص"],
    ["email", "البريد (لإنشاء الحساب)", "email@company.com"],
    ["position", "المسمى الوظيفي", "نص"],
    ["department_name", "اسم القسم كما هو مسجل", "المالية"],
    ["hire_date", "تاريخ التعيين", "YYYY-MM-DD"],
    ["base_salary", "الراتب الأساسي", "رقم"],
    ["allowances", "البدلات", "رقم"],
    ["status", "حالة الموظف", "active / on_leave / terminated"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.utils.book_append_sheet(wb, instructions, "التعليمات");
  XLSX.writeFile(wb, "employees_template.xlsx");
}
