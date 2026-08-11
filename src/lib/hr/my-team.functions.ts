import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export interface PendingLeaveAction {
  kind: "leave";
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  attachment_path: string | null;
  created_at: string;
}

export interface PendingPermissionAction {
  kind: "permission";
  id: string;
  employee_id: string;
  employee_name: string;
  type: string;
  request_date: string;
  from_time: string;
  to_time: string;
  reason: string | null;
  attachment_path: string | null;
  created_at: string;
}

export type PendingAction = PendingLeaveAction | PendingPermissionAction;

const PERMISSION_TYPE_LABEL: Record<string, string> = {
  late_arrival: "تأخر مبرر",
  early_leave: "خروج مبكر",
  personal_excuse: "استئذان شخصي",
  makeup_hours: "تعويض ساعات",
};

/**
 * Manager pending-actions center: every pending leave and permission
 * request across the manager's team, in one place with enough detail to
 * approve/reject inline — no more navigating to /leaves and /permissions
 * separately just to see what's waiting. Attendance-correction requests
 * keep their existing dedicated queue (/attendance-corrections) since
 * that page already scopes and handles them well; this focuses on the
 * two request types a manager acts on daily.
 */
export const listMyTeamPendingActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingAction[]> => {
    const { supabase, userId } = context;
    const { data: deptRow } = await supabase.rpc("manager_department_id", { _user_id: userId });
    const departmentId = (deptRow as string | null) ?? null;
    if (!departmentId) return [];

    const { data: emps } = await supabase
      .from("employees")
      .select("id, user_id")
      .eq("department_id", departmentId)
      .neq("user_id", userId);
    const empIds = (emps ?? []).map((e) => e.id);
    if (!empIds.length) return [];

    const userIds = (emps ?? []).map((e) => e.user_id).filter(Boolean);
    const [{ data: profiles }, { data: leaves }, { data: perms }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      supabase
        .from("leave_requests")
        .select(
          "id, employee_id, start_date, end_date, days, reason, attachment_path, created_at, leave_types(name_ar)",
        )
        .in("employee_id", empIds)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("permission_requests")
        .select(
          "id, employee_id, type, request_date, from_time, to_time, reason, attachment_path, created_at",
        )
        .in("employee_id", empIds)
        .eq("status", "pending")
        // Attendance-correction requests are stored as personal_excuse with
        // a special reason prefix — excluded here, handled by their own page.
        .eq("kind", "permission")
        .order("created_at", { ascending: true }),
    ]);

    const nameByUser = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const nameByEmp = new Map((emps ?? []).map((e) => [e.id, nameByUser.get(e.user_id) ?? "—"]));

    const leaveActions: PendingLeaveAction[] = (leaves ?? []).map((l) => ({
      kind: "leave",
      id: l.id,
      employee_id: l.employee_id,
      employee_name: nameByEmp.get(l.employee_id) ?? "—",
      leave_type_name: (l as { leave_types?: { name_ar?: string } }).leave_types?.name_ar ?? "—",
      start_date: l.start_date,
      end_date: l.end_date,
      days: l.days,
      reason: l.reason,
      attachment_path: (l as { attachment_path?: string | null }).attachment_path ?? null,
      created_at: l.created_at,
    }));

    const permActions: PendingPermissionAction[] = (perms ?? []).map((p) => ({
      kind: "permission",
      id: p.id,
      employee_id: p.employee_id,
      employee_name: nameByEmp.get(p.employee_id) ?? "—",
      type: PERMISSION_TYPE_LABEL[p.type] ?? p.type,
      request_date: p.request_date,
      from_time: p.from_time,
      to_time: p.to_time,
      reason: p.reason,
      attachment_path: (p as { attachment_path?: string | null }).attachment_path ?? null,
      created_at: p.created_at,
    }));

    return [...leaveActions, ...permActions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  });

export interface MyTeamMember {
  employee_id: string;
  full_name: string;
  position: string | null;
  employee_no: string | null;
  status: string;
  today_status: "present" | "late" | "absent" | "leave" | "off" | "pending";
  pending_leaves: number;
  pending_permissions: number;
}

export interface MyTeamResult {
  department_id: string | null;
  department_name: string | null;
  members: MyTeamMember[];
}

export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyTeamResult> => {
    const { supabase, userId } = context;

    // Resolve manager's department via helper (SECURITY DEFINER)
    const { data: deptRow } = await supabase.rpc("manager_department_id", { _user_id: userId });
    const departmentId = (deptRow as string | null) ?? null;
    if (!departmentId) return { department_id: null, department_name: null, members: [] };

    const { data: dept } = await supabase
      .from("departments")
      .select("name")
      .eq("id", departmentId)
      .maybeSingle();

    const { data: emps, error } = await supabase
      .from("employees")
      .select("id, user_id, position, employee_no, status")
      .eq("department_id", departmentId)
      .neq("user_id", userId)
      .order("created_at");
    if (error) throw mapDbError(error);
    if (!emps?.length) {
      return {
        department_id: departmentId,
        department_name: (dept as any)?.name ?? null,
        members: [],
      };
    }

    const empIds = emps.map((e: any) => e.id);
    const userIds = emps.map((e: any) => e.user_id).filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: profiles }, { data: att }, { data: pendingLeaves }, { data: pendingPerms }] =
      await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("attendance_records")
          .select("employee_id, status")
          .in("employee_id", empIds)
          .eq("work_date", today),
        supabase
          .from("leave_requests")
          .select("employee_id")
          .in("employee_id", empIds)
          .eq("status", "pending"),
        supabase
          .from("permission_requests")
          .select("employee_id")
          .in("employee_id", empIds)
          .eq("status", "pending"),
      ]);

    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const attMap = new Map((att ?? []).map((a: any) => [a.employee_id, a.status]));
    const leaveCount = new Map<string, number>();
    for (const r of pendingLeaves ?? [])
      leaveCount.set((r as any).employee_id, (leaveCount.get((r as any).employee_id) ?? 0) + 1);
    const permCount = new Map<string, number>();
    for (const r of pendingPerms ?? [])
      permCount.set((r as any).employee_id, (permCount.get((r as any).employee_id) ?? 0) + 1);

    const members: MyTeamMember[] = emps.map((e: any) => {
      const s = attMap.get(e.id);
      let today_status: MyTeamMember["today_status"] = "absent";
      if (s === "present") today_status = "present";
      else if (s === "late") today_status = "late";
      else if (s === "on_leave" || s === "leave") today_status = "leave";
      else if (s === "off" || s === "weekend") today_status = "off";
      else if (!s) today_status = "pending";
      return {
        employee_id: e.id,
        full_name: (profMap.get(e.user_id) as string) ?? "—",
        position: e.position,
        employee_no: e.employee_no,
        status: e.status,
        today_status,
        pending_leaves: leaveCount.get(e.id) ?? 0,
        pending_permissions: permCount.get(e.id) ?? 0,
      };
    });

    return {
      department_id: departmentId,
      department_name: (dept as any)?.name ?? null,
      members,
    };
  });
