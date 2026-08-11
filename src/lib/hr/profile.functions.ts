// Employee profile aggregate — the "single source of truth" read model.
// Everything is pulled live from the canonical tables (employees, profiles,
// departments, contracts, leave_requests, payroll_runs, attendance_records);
// nothing is duplicated or re-entered. Access control:
//   - Row visibility is delegated to RLS via the caller's client.
//   - Financial fields (salary, IBAN, national ID, payroll history) are only
//     included for the employee themself, hr_admin, or accountant.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";
import { riyadhToday } from "@/lib/hr/time";
import { computeMissingFields } from "@/lib/hr/employees.functions";

export interface EmployeeProfile {
  id: string;
  employee_no: string | null;
  full_name: string;
  position: string;
  department_name: string | null;
  status: string;
  hire_date: string;
  is_self: boolean;
  missing_fields: string[];
  financials: {
    base_salary: number;
    allowances: number;
    national_id: string | null;
    bank_name: string | null;
    iban: string | null;
  } | null;
  month_summary: {
    month: string;
    present: number;
    late: number;
    early: number;
    half_day: number;
    leave: number;
    late_minutes: number;
  };
  leaves: {
    approved_days_this_year: number;
    recent: Array<{
      id: string;
      start_date: string;
      end_date: string;
      days: number;
      status: string;
    }>;
  };
  contracts: Array<{ id: string; title: string; status: string; created_at: string }>;
  shift: { name: string; start: string; end: string } | null;
  evaluations: {
    latest: { period: string; avg: number } | null;
    average: number | null;
    count: number;
  };
  documents: Array<{
    id: string;
    title: string;
    category: string;
    expiry_date: string | null;
    days_to_expiry: number | null;
  }>;
  permissions: Array<{
    id: string;
    type: string;
    request_date: string;
    from_time: string;
    to_time: string;
    status: string;
  }>;
  punches: Array<{
    id: string;
    kind: "in" | "out";
    punched_at: string;
    adopted: boolean;
    via_override: boolean;
    lat: number | null;
    lng: number | null;
  }>;
  payroll: Array<{
    period_month: string;
    net_salary: number;
    absence_days: number;
    late_minutes: number;
    locked: boolean;
  }> | null;
}

const inputSchema = z.object({ employee_id: z.string().uuid() });

export const getEmployeeProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<EmployeeProfile> => {
    const { supabase, userId } = context;

    // Row access is decided by RLS: if the caller cannot see this employee,
    // the select comes back empty and we stop here.
    const { data: emp, error } = await supabase
      .from("employees")
      .select(
        "id, user_id, employee_no, position, department_id, base_salary, allowances, hire_date, status, national_id, bank_name, iban",
      )
      .eq("id", data.employee_id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!emp) throw new Error("الموظف غير موجود أو لا تملك صلاحية عرضه");

    const isSelf = emp.user_id === userId;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const canSeeFinancials = isSelf || roleSet.has("hr_admin") || roleSet.has("accountant");

    const today = riyadhToday();
    const monthStart = today.slice(0, 7) + "-01";
    const yearStart = today.slice(0, 4) + "-01-01";

    const [
      profileRes,
      deptRes,
      attRes,
      leavesRes,
      approvedRes,
      contractsRes,
      shiftRes,
      evalsRes,
      docsRes,
      permsRes,
      punchesRes,
      payrollRes,
    ] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", emp.user_id).maybeSingle(),
      emp.department_id
        ? supabase.from("departments").select("name").eq("id", emp.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("attendance_records")
        .select("status, late_minutes")
        .eq("employee_id", emp.id)
        .gte("work_date", monthStart)
        .lte("work_date", today),
      supabase
        .from("leave_requests")
        .select("id, start_date, end_date, days, status")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("leave_requests")
        .select("days")
        .eq("employee_id", emp.id)
        .eq("status", "approved")
        .gte("start_date", yearStart),
      supabase
        .from("contracts")
        .select("id, title, status, created_at")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("employee_shifts")
        .select("effective_from, effective_to, shifts(name_ar, start_time, end_time, active)")
        .eq("employee_id", data.employee_id)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("evaluations")
        .select("period, performance, commitment, teamwork, quality")
        .eq("employee_id", data.employee_id)
        .order("period", { ascending: false })
        .limit(12),
      supabase
        .from("employee_documents")
        .select("id, title, category, expiry_date")
        .eq("employee_id", data.employee_id)
        .order("expiry_date", { ascending: true })
        .limit(10),
      supabase
        .from("permission_requests")
        .select("id, type, request_date, from_time, to_time, status")
        .eq("employee_id", data.employee_id)
        .order("request_date", { ascending: false })
        .limit(6),
      supabase
        .from("attendance_punches")
        .select("id, kind, punched_at, adopted, via_override, lat, lng")
        .eq("employee_id", data.employee_id)
        .order("punched_at", { ascending: false })
        .limit(12),
      canSeeFinancials
        ? supabase
            .from("payroll_runs")
            .select("period_month, net_salary, absence_days, late_minutes, locked_at")
            .eq("employee_id", emp.id)
            .order("period_month", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: null }),
    ]);

    const att = attRes.data ?? [];
    const count = (s: string) => att.filter((r) => r.status === s).length;

    return {
      id: emp.id,
      employee_no: emp.employee_no,
      full_name: profileRes.data?.full_name ?? "—",
      position: emp.position,
      department_name: (deptRes.data as { name?: string } | null)?.name ?? null,
      status: emp.status,
      hire_date: emp.hire_date,
      is_self: isSelf,
      missing_fields: canSeeFinancials ? computeMissingFields(emp) : [],
      financials: canSeeFinancials
        ? {
            base_salary: Number(emp.base_salary),
            allowances: Number(emp.allowances),
            national_id: emp.national_id,
            bank_name: emp.bank_name,
            iban: emp.iban,
          }
        : null,
      month_summary: {
        month: monthStart,
        present: count("present"),
        late: count("late"),
        early: count("early"),
        half_day: count("half_day"),
        leave: count("leave"),
        late_minutes: att.reduce((a, r) => a + (r.late_minutes || 0), 0),
      },
      leaves: {
        approved_days_this_year: (approvedRes.data ?? []).reduce(
          (a, r) => a + Number(r.days || 0),
          0,
        ),
        recent: leavesRes.data ?? [],
      },
      contracts: contractsRes.data ?? [],
      shift: (() => {
        const s = (
          shiftRes.data as {
            shifts?: { name_ar: string; start_time: string; end_time: string; active: boolean };
          } | null
        )?.shifts;
        if (!s || s.active === false) return null;
        return { name: s.name_ar, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) };
      })(),
      evaluations: (() => {
        const rows = evalsRes.data ?? [];
        const avgOf = (r: {
          performance: number;
          commitment: number;
          teamwork: number;
          quality: number;
        }) => (r.performance + r.commitment + r.teamwork + r.quality) / 4;
        const latest = rows[0]
          ? { period: rows[0].period, avg: Math.round(avgOf(rows[0]) * 10) / 10 }
          : null;
        const average = rows.length
          ? Math.round((rows.reduce((a, r) => a + avgOf(r), 0) / rows.length) * 10) / 10
          : null;
        return { latest, average, count: rows.length };
      })(),
      documents: (docsRes.data ?? []).map((d) => ({
        ...d,
        days_to_expiry: d.expiry_date
          ? Math.ceil(
              (new Date(d.expiry_date + "T00:00:00Z").getTime() -
                new Date(today + "T00:00:00Z").getTime()) /
                86_400_000,
            )
          : null,
      })),
      permissions: permsRes.data ?? [],
      // RLS-scoped: self, HR admin, and the employee's dept manager see these.
      punches: (punchesRes.data ?? []).map((p) => ({
        ...p,
        kind: p.kind as "in" | "out",
      })),
      payroll: canSeeFinancials
        ? (payrollRes.data ?? []).map((r) => ({
            period_month: r.period_month,
            net_salary: Number(r.net_salary),
            absence_days: r.absence_days,
            late_minutes: r.late_minutes,
            locked: !!(r as { locked_at?: string | null }).locked_at,
          }))
        : null,
    };
  });
