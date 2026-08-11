import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export interface TeamMetrics {
  from: string;
  to: string;
  present_days: number;
  late_days: number;
  absent_days: number;
  attendance_rate: number;   // 0..100
  leaves_taken: number;      // approved leave days
  permissions_used: number;  // approved permissions count
  pending_leaves: number;
  pending_permissions: number;
  // previous period comparison (same-length prior window)
  prev: {
    attendance_rate: number;
    late_days: number;
    absent_days: number;
    leaves_taken: number;
    permissions_used: number;
  };
  members_count: number;
}

const input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function shiftDate(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

async function computeWindow(supabase: any, empIds: string[], from: string, to: string) {
  if (!empIds.length) {
    return { present: 0, late: 0, absent: 0, leaves: 0, perms: 0 };
  }
  const [{ data: att }, { data: leaves }, { data: perms }] = await Promise.all([
    supabase.from("attendance_records").select("status").in("employee_id", empIds).gte("work_date", from).lte("work_date", to),
    supabase.from("leave_requests").select("days").in("employee_id", empIds).eq("status", "approved").gte("start_date", from).lte("end_date", to),
    supabase.from("permission_requests").select("id").in("employee_id", empIds).eq("status", "approved").gte("request_date", from).lte("request_date", to),
  ]);

  let present = 0, late = 0, absent = 0;
  for (const r of att ?? []) {
    if ((r as any).status === "present") present++;
    else if ((r as any).status === "late") { present++; late++; }
    else if ((r as any).status === "absent") absent++;
  }
  const leaveDays = (leaves ?? []).reduce((s: number, x: any) => s + Number(x.days ?? 0), 0);
  return { present, late, absent, leaves: leaveDays, perms: (perms ?? []).length };
}

export const getMyTeamMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<TeamMetrics> => {
    const { supabase, userId } = context;
    const { data: deptId } = await supabase.rpc("manager_department_id", { _user_id: userId });
    const department_id = (deptId as string | null) ?? null;
    if (!department_id) {
      return {
        from: data.from, to: data.to, present_days: 0, late_days: 0, absent_days: 0,
        attendance_rate: 0, leaves_taken: 0, permissions_used: 0, pending_leaves: 0, pending_permissions: 0,
        prev: { attendance_rate: 0, late_days: 0, absent_days: 0, leaves_taken: 0, permissions_used: 0 },
        members_count: 0,
      };
    }
    const { data: emps, error } = await supabase.from("employees").select("id").eq("department_id", department_id);
    if (error) throw mapDbError(error);
    const empIds = (emps ?? []).map((e: any) => e.id);

    const len = diffDays(data.from, data.to);
    const prevTo = shiftDate(data.from, -1);
    const prevFrom = shiftDate(prevTo, -(len - 1));

    const [cur, prev, pendL, pendP] = await Promise.all([
      computeWindow(supabase, empIds, data.from, data.to),
      computeWindow(supabase, empIds, prevFrom, prevTo),
      empIds.length ? supabase.from("leave_requests").select("id").in("employee_id", empIds).eq("status", "pending") : Promise.resolve({ data: [] as any[] }),
      empIds.length ? supabase.from("permission_requests").select("id").in("employee_id", empIds).eq("status", "pending") : Promise.resolve({ data: [] as any[] }),
    ]);

    const rate = (c: { present: number; absent: number }) => {
      const total = c.present + c.absent;
      return total ? Math.round((c.present / total) * 1000) / 10 : 0;
    };

    return {
      from: data.from, to: data.to,
      present_days: cur.present, late_days: cur.late, absent_days: cur.absent,
      attendance_rate: rate(cur),
      leaves_taken: cur.leaves, permissions_used: cur.perms,
      pending_leaves: (pendL.data ?? []).length,
      pending_permissions: (pendP.data ?? []).length,
      prev: {
        attendance_rate: rate(prev),
        late_days: prev.late, absent_days: prev.absent,
        leaves_taken: prev.leaves, permissions_used: prev.perms,
      },
      members_count: empIds.length,
    };
  });

// -------- Command search --------
export const commandSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isHR = (await supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" })).data;
    const isMgr = (await supabase.rpc("has_role", { _user_id: userId, _role: "dept_manager" })).data;

    let empQuery = supabase.from("employees").select("id, user_id, employee_no, position, department_id").limit(10);
    if (!isHR && isMgr) {
      const { data: dept } = await supabase.rpc("manager_department_id", { _user_id: userId });
      if (dept) empQuery = empQuery.eq("department_id", dept as string);
    } else if (!isHR && !isMgr) {
      empQuery = empQuery.eq("user_id", userId);
    }

    // Search by employee_no or position
    const like = `%${data.q}%`;
    const { data: byNo } = await empQuery.or(`employee_no.ilike.${like},position.ilike.${like}`);
    let results = byNo ?? [];

    // Also search profiles by name
    const { data: profs } = await supabase.from("profiles").select("id, full_name").ilike("full_name", like).limit(10);
    const userIds = (profs ?? []).map((p: any) => p.id);
    if (userIds.length) {
      let q2 = supabase.from("employees").select("id, user_id, employee_no, position, department_id").in("user_id", userIds).limit(10);
      if (!isHR && isMgr) {
        const { data: dept } = await supabase.rpc("manager_department_id", { _user_id: userId });
        if (dept) q2 = q2.eq("department_id", dept as string);
      } else if (!isHR && !isMgr) {
        q2 = q2.eq("user_id", userId);
      }
      const { data: byName } = await q2;
      const map = new Map(results.map((e: any) => [e.id, e]));
      for (const e of byName ?? []) map.set((e as any).id, e);
      results = Array.from(map.values());
    }

    // Attach names
    const uids = results.map((r: any) => r.user_id);
    const { data: allProfs } = uids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", uids)
      : { data: [] as any[] };
    const nm = new Map((allProfs ?? []).map((p: any) => [p.id, p.full_name]));
    return results.slice(0, 10).map((e: any) => ({
      id: e.id, employee_no: e.employee_no, position: e.position,
      full_name: nm.get(e.user_id) ?? "—",
    }));
  });
