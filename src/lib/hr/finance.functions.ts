// Dedicated finance dashboard — a standalone view (not folded into the
// general analytics dashboard) for HR/accountant/owner/admin covering:
//   - per-employee projected pay (owed to date / projected month-end)
//   - department-level cost breakdown
//   - historical payroll cost trend (last 6 closed months, from payroll_runs)
// All projection math reuses computePayrollRows — the exact engine that
// generates real payroll — so nothing here can drift from what employees
// are actually paid.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { riyadhToday, nextMonthStart, lastDateOfMonth } from "@/lib/hr/time";
import { computePayrollRows } from "@/lib/hr/payroll-engine";

export interface FinanceEmployeeRow {
  employee_id: string;
  employee_no: string;
  full_name: string;
  department_name: string | null;
  base_salary: number;
  owed_to_date: number;
  projected_month_end: number;
  absence_days: number;
  late_minutes: number;
}

export interface FinanceDashboard {
  month: string;
  as_of: string;
  totals: {
    owed_to_date: number;
    projected_month_end: number;
    total_bonuses: number;
    total_deductions_manual: number;
    total_absence_deduction: number;
    total_late_deduction: number;
  };
  by_department: Array<{
    id: string;
    name: string;
    headcount: number;
    projected_month_end: number;
  }>;
  employees: FinanceEmployeeRow[];
  /** Last 6 closed months' actual paid total, from finalized payroll_runs. */
  history: Array<{ month: string; total_paid: number; headcount: number }>;
}

export const getFinanceDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FinanceDashboard | null> => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const canView =
      roleSet.has("hr_admin") ||
      roleSet.has("accountant") ||
      roleSet.has("owner") ||
      roleSet.has("admin");
    if (!canView) return null;

    const today = riyadhToday();
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd = lastDateOfMonth(monthStart);

    const [
      { data: emps },
      { data: depts },
      { data: profiles },
      { data: rules },
      { data: monthAtt },
      { data: bonuses },
      { data: deductions },
      { data: hol },
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, user_id, employee_no, department_id, hire_date, base_salary, allowances")
        .eq("status", "active"),
      supabase.from("departments").select("id, name"),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .from("attendance_rules")
        .select("department_id, absence_deduction, late_deduction_per_minute, absence_calc_mode"),
      supabase
        .from("attendance_records")
        .select("employee_id, work_date, status, late_minutes, late_deduction_amount")
        .gte("work_date", monthStart)
        .lte("work_date", today),
      supabase
        .from("bonuses")
        .select("employee_id, amount")
        .gte("period_month", monthStart)
        .lt("period_month", nextMonthStart(monthStart)),
      supabase
        .from("deductions")
        .select("employee_id, amount")
        .gte("period_month", monthStart)
        .lt("period_month", nextMonthStart(monthStart)),
      supabase
        .from("holidays")
        .select("start_date, end_date")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
    ]);

    const employees = emps ?? [];
    const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name as string]));

    const engineArgs = {
      periodMonth: monthStart,
      employees: employees as any,
      attendance: (monthAtt ?? []) as any,
      bonuses: (bonuses ?? []) as any,
      deductions: (deductions ?? []) as any,
      rules: (rules ?? []) as any,
      holidays: (hol ?? []) as any,
    };
    const toDateRows = computePayrollRows({ ...engineArgs, asOfDate: today });
    const monthEndRows = computePayrollRows({ ...engineArgs, asOfDate: monthEnd });
    const monthEndByEmp = new Map(monthEndRows.map((r) => [r.employee_id, r]));

    const empById = new Map(employees.map((e) => [e.id, e]));
    const deptByEmp = new Map(employees.map((e) => [e.id, e.department_id]));

    const employeeRows: FinanceEmployeeRow[] = toDateRows.map((r) => {
      const emp = empById.get(r.employee_id);
      const endRow = monthEndByEmp.get(r.employee_id);
      return {
        employee_id: r.employee_id,
        employee_no: emp?.employee_no ?? "—",
        full_name: (emp?.user_id && nameByUser.get(emp.user_id)) || "—",
        department_name: emp?.department_id ? (deptNameById.get(emp.department_id) ?? null) : null,
        base_salary: Number(emp?.base_salary ?? 0),
        owed_to_date: Math.round(r.net_salary),
        projected_month_end: Math.round(endRow?.net_salary ?? r.net_salary),
        absence_days: r.absence_days,
        late_minutes: r.late_minutes,
      };
    });

    const deptAgg = new Map<string, { headcount: number; projected: number }>();
    for (const r of monthEndRows) {
      const deptId = deptByEmp.get(r.employee_id);
      if (!deptId) continue;
      const agg = deptAgg.get(deptId) ?? { headcount: 0, projected: 0 };
      agg.headcount += 1;
      agg.projected += r.net_salary;
      deptAgg.set(deptId, agg);
    }
    const byDepartment = Array.from(deptAgg.entries())
      .map(([id, agg]) => ({
        id,
        name: deptNameById.get(id) ?? "—",
        headcount: agg.headcount,
        projected_month_end: Math.round(agg.projected),
      }))
      .sort((a, b) => b.projected_month_end - a.projected_month_end);

    const totals = {
      owed_to_date: Math.round(toDateRows.reduce((s, r) => s + r.net_salary, 0)),
      projected_month_end: Math.round(monthEndRows.reduce((s, r) => s + r.net_salary, 0)),
      total_bonuses: Math.round(toDateRows.reduce((s, r) => s + r.bonuses_total, 0)),
      total_deductions_manual: Math.round(toDateRows.reduce((s, r) => s + r.deductions_total, 0)),
      total_absence_deduction: Math.round(toDateRows.reduce((s, r) => s + r.absence_deduction, 0)),
      total_late_deduction: Math.round(toDateRows.reduce((s, r) => s + r.late_deduction, 0)),
    };

    // Historical trend: last 6 months' ACTUAL finalized payroll (real,
    // already-paid figures — not projections) from payroll_runs directly.
    const sixMonthsAgoStart = (() => {
      const [y, m] = monthStart.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 - 6, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    })();
    const { data: histRows } = await supabase
      .from("payroll_runs")
      .select("period_month, net_salary, employee_id")
      .gte("period_month", sixMonthsAgoStart)
      .lt("period_month", monthStart);
    const histByMonth = new Map<string, { total: number; emps: Set<string> }>();
    for (const r of histRows ?? []) {
      const bucket = histByMonth.get(r.period_month) ?? { total: 0, emps: new Set<string>() };
      bucket.total += Number(r.net_salary);
      bucket.emps.add(r.employee_id);
      histByMonth.set(r.period_month, bucket);
    }
    const history = Array.from(histByMonth.entries())
      .map(([month, b]) => ({
        month,
        total_paid: Math.round(b.total),
        headcount: b.emps.size,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      month: monthStart,
      as_of: today,
      totals,
      by_department: byDepartment,
      employees: employeeRows.sort((a, b) => b.projected_month_end - a.projected_month_end),
      history,
    };
  });
