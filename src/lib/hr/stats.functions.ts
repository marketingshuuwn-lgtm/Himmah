import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardStats {
  employees: number | null;
  departments: number | null;
  pendingContracts: number | null;
  todayAttendance: number | null;
  myPendingContracts: number | null;
  myLastNetSalary: number | null;
  myAttendanceToday: "in" | "out" | "none";
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const { supabase, userId } = context;

    const isHr = await supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" });
    const isMgr = await supabase.rpc("has_role", { _user_id: userId, _role: "dept_manager" });
    const isAcc = await supabase.rpc("has_role", { _user_id: userId, _role: "accountant" });
    const elevated = !!(isHr.data || isMgr.data || isAcc.data);

    const today = new Date().toISOString().slice(0, 10);

    let employees: number | null = null;
    let departments: number | null = null;
    let pendingContracts: number | null = null;
    let todayAttendance: number | null = null;

    if (elevated) {
      const [e, d, c, a] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("work_date", today),
      ]);
      employees = e.count ?? 0;
      departments = d.count ?? 0;
      pendingContracts = c.count ?? 0;
      todayAttendance = a.count ?? 0;
    }

    // Employee-scoped
    let myPendingContracts: number | null = null;
    let myLastNetSalary: number | null = null;
    let myAttendanceToday: DashboardStats["myAttendanceToday"] = "none";

    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (emp) {
      const [pc, ls, att] = await Promise.all([
        supabase
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", emp.id)
          .eq("status", "sent"),
        supabase
          .from("payroll_runs")
          .select("net_salary")
          .eq("employee_id", emp.id)
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("attendance_records")
          .select("check_in_at, check_out_at")
          .eq("employee_id", emp.id)
          .eq("work_date", today)
          .maybeSingle(),
      ]);
      myPendingContracts = pc.count ?? 0;
      myLastNetSalary = (ls.data?.net_salary as number | undefined) ?? null;
      if (att.data) {
        myAttendanceToday = att.data.check_out_at ? "out" : att.data.check_in_at ? "in" : "none";
      }
    }

    return {
      employees,
      departments,
      pendingContracts,
      todayAttendance,
      myPendingContracts,
      myLastNetSalary,
      myAttendanceToday,
    };
  });
