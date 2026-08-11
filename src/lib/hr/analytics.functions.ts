// Management analytics dashboard — the "real dashboard" replacing the
// link-list. Everything is computed live from canonical tables (no
// duplicated/cached figures): attendance_records, employees, departments,
// leave_requests, permission_requests, contracts, payroll_disputes.
// Restricted to hr_admin / accountant / owner / admin.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  riyadhToday,
  datesInRange,
  isWeekend,
  nextMonthStart,
  lastDateOfMonth,
} from "@/lib/hr/time";
import { workingDatesOfMonth, holidayDateSet, computePayrollRows } from "@/lib/hr/payroll-engine";

export interface AnalyticsDashboard {
  month: string;
  as_of: string;
  headcount: number;
  compliance_rate: number; // 0-100, org-wide, elapsed working days this month
  cost_this_month: {
    late_deduction: number;
    absence_deduction: number;
    total: number;
  };
  /** Reuses the exact same payroll engine as actual payroll generation —
   * guaranteed to match what will really be paid, not a separate estimate. */
  payroll_projection: {
    /** Sum of net_salary if payroll were generated right now (today). */
    owed_to_date: number;
    /** Sum of net_salary projected to month-end, assuming no further
     * absences/lateness beyond what's already recorded. */
    projected_month_end: number;
  };
  trend_30d: Array<{ date: string; present: number; late: number; absent: number }>;
  departments: Array<{
    id: string;
    name: string;
    headcount: number;
    compliance_rate: number;
    late_minutes: number;
    absence_days: number;
  }>;
  pending: {
    leaves: number;
    permissions: number;
    contracts: number;
    payroll_disputes: number;
    attendance_corrections: number;
  };
}

const EXCUSED = new Set(["present", "late", "early", "half_day", "leave"]);

export const getAnalyticsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnalyticsDashboard | null> => {
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
    const trendStart = (() => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 29);
      return d.toISOString().slice(0, 10);
    })();

    const [
      { data: emps },
      { data: depts },
      { data: hol },
      { data: rules },
      { data: monthAtt },
      { data: trendAtt },
      { data: bonuses },
      { data: deductions },
      leavesPending,
      pendingPermissionRows,
      contractsPending,
      disputesPending,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, department_id, hire_date, base_salary, allowances")
        .eq("status", "active"),
      supabase.from("departments").select("id, name"),
      supabase
        .from("holidays")
        .select("start_date, end_date")
        .lte("start_date", today)
        .gte("end_date", monthStart),
      supabase
        .from("attendance_rules")
        .select("department_id, absence_deduction, late_deduction_per_minute, absence_calc_mode"),
      supabase
        .from("attendance_records")
        .select("employee_id, work_date, status, late_minutes, late_deduction_amount")
        .gte("work_date", monthStart)
        .lte("work_date", today),
      supabase
        .from("attendance_records")
        .select("work_date, status")
        .gte("work_date", trendStart)
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
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // Attendance-correction requests live in permission_requests but carry
      // an explicit kind, so the split below is a column check, not string
      // matching on the reason text.
      supabase.from("permission_requests").select("kind").eq("status", "pending"),
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "sent"),
      supabase
        .from("payroll_disputes")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    const pendingRows = pendingPermissionRows.data ?? [];
    const isCorrection = (r: { kind: string | null }) => r.kind === "attendance_correction";
    const pendingCorrectionsCount = pendingRows.filter(isCorrection).length;
    const pendingRealPermissionsCount = pendingRows.length - pendingCorrectionsCount;

    const employees = emps ?? [];
    const holidaySet = holidayDateSet((hol ?? []) as { start_date: string; end_date: string }[]);
    const workingDates = workingDatesOfMonth(monthStart, hol ?? []).filter((d) => d <= today);

    const absenceByDept = new Map<string | null, number>();
    for (const r of rules ?? [])
      absenceByDept.set(r.department_id, Number(r.absence_deduction || 0));
    const globalAbsence = absenceByDept.get(null) ?? 0;
    const getAbsenceRate = (d: string | null): number =>
      d != null && absenceByDept.has(d) ? (absenceByDept.get(d) as number) : globalAbsence;

    const attendedByEmp = new Map<string, Set<string>>();
    const lateDeductionByEmp = new Map<string, number>();
    const lateMinutesByEmp = new Map<string, number>();
    for (const r of monthAtt ?? []) {
      if (EXCUSED.has(r.status)) {
        let s = attendedByEmp.get(r.employee_id);
        if (!s) attendedByEmp.set(r.employee_id, (s = new Set()));
        s.add(r.work_date);
      }
      lateDeductionByEmp.set(
        r.employee_id,
        (lateDeductionByEmp.get(r.employee_id) || 0) + Number(r.late_deduction_amount || 0),
      );
      lateMinutesByEmp.set(
        r.employee_id,
        (lateMinutesByEmp.get(r.employee_id) || 0) + Number(r.late_minutes || 0),
      );
    }

    let totalAbsenceCost = 0;
    let totalLateCost = 0;
    let totalElapsedSlots = 0;
    let totalAttendedSlots = 0;

    const deptAgg = new Map<
      string,
      {
        headcount: number;
        lateMinutes: number;
        absenceDays: number;
        elapsed: number;
        attended: number;
      }
    >();

    for (const e of employees) {
      const effDates = e.hire_date ? workingDates.filter((d) => d >= e.hire_date) : workingDates;
      const attended = attendedByEmp.get(e.id) ?? new Set<string>();
      const absentDays = effDates.reduce((acc, d) => acc + (attended.has(d) ? 0 : 1), 0);
      const absenceCost = absentDays * getAbsenceRate(e.department_id);
      const lateCost = lateDeductionByEmp.get(e.id) || 0;
      const lateMin = lateMinutesByEmp.get(e.id) || 0;

      totalAbsenceCost += absenceCost;
      totalLateCost += lateCost;
      totalElapsedSlots += effDates.length;
      totalAttendedSlots += effDates.length - absentDays;

      const key = e.department_id ?? "__none__";
      const agg = deptAgg.get(key) ?? {
        headcount: 0,
        lateMinutes: 0,
        absenceDays: 0,
        elapsed: 0,
        attended: 0,
      };
      agg.headcount += 1;
      agg.absenceDays += absentDays;
      agg.lateMinutes += lateMin;
      agg.elapsed += effDates.length;
      agg.attended += effDates.length - absentDays;
      deptAgg.set(key, agg);
    }

    const complianceRate =
      totalElapsedSlots > 0
        ? Math.round((totalAttendedSlots / totalElapsedSlots) * 1000) / 10
        : 100;

    const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));
    const departments = Array.from(deptAgg.entries())
      .filter(([id]) => id !== "__none__")
      .map(([id, agg]) => ({
        id,
        name: deptNameById.get(id) ?? "—",
        headcount: agg.headcount,
        compliance_rate:
          agg.elapsed > 0 ? Math.round((agg.attended / agg.elapsed) * 1000) / 10 : 100,
        late_minutes: agg.lateMinutes,
        absence_days: agg.absenceDays,
      }))
      .sort((a, b) => a.compliance_rate - b.compliance_rate);

    // ---- 30-day org-wide trend ----
    const trendDates = datesInRange(trendStart, today).filter(
      (d) => !isWeekend(d) && !holidaySet.has(d),
    );
    const byDate = new Map<string, { present: number; late: number; total: number }>();
    for (const d of trendDates) byDate.set(d, { present: 0, late: 0, total: 0 });
    for (const r of trendAtt ?? []) {
      const bucket = byDate.get(r.work_date);
      if (!bucket) continue;
      bucket.total += 1;
      if (r.status === "late") bucket.late += 1;
      else if (["present", "early", "half_day", "leave"].includes(r.status)) bucket.present += 1;
    }
    const headcountNow = employees.length;
    const trend_30d = trendDates.map((date) => {
      const b = byDate.get(date)!;
      return {
        date,
        present: b.present,
        late: b.late,
        absent: Math.max(0, headcountNow - b.total),
      };
    });

    // Reuse the EXACT same engine that generates real payroll — the
    // projection can never drift from what will actually be paid.
    const monthEnd = lastDateOfMonth(monthStart);
    const engineArgs = {
      periodMonth: monthStart,
      employees: employees as any,
      attendance: (monthAtt ?? []) as any,
      bonuses: (bonuses ?? []) as any,
      deductions: (deductions ?? []) as any,
      rules: (rules ?? []) as any,
      holidays: (hol ?? []) as any,
    };
    const owedToDate = computePayrollRows({ ...engineArgs, asOfDate: today }).reduce(
      (sum, r) => sum + r.net_salary,
      0,
    );
    const projectedMonthEnd = computePayrollRows({ ...engineArgs, asOfDate: monthEnd }).reduce(
      (sum, r) => sum + r.net_salary,
      0,
    );

    return {
      month: monthStart,
      as_of: today,
      headcount: headcountNow,
      compliance_rate: complianceRate,
      cost_this_month: {
        late_deduction: Math.round(totalLateCost),
        absence_deduction: Math.round(totalAbsenceCost),
        total: Math.round(totalLateCost + totalAbsenceCost),
      },
      payroll_projection: {
        owed_to_date: Math.round(owedToDate),
        projected_month_end: Math.round(projectedMonthEnd),
      },
      trend_30d,
      departments,
      pending: {
        leaves: leavesPending.count ?? 0,
        permissions: pendingRealPermissionsCount,
        contracts: contractsPending.count ?? 0,
        payroll_disputes: disputesPending.count ?? 0,
        attendance_corrections: pendingCorrectionsCount,
      },
    };
  });
