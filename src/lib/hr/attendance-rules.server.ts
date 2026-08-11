/**
 * Attendance data-access helpers (server only).
 *
 * Kept out of `attendance.functions.ts` so that file stays a thin wrapper of
 * `createServerFn` declarations — see the header of `attendance-core.ts`.
 */

import {
  applyShiftToRule,
  applySpecialPeriodToRule,
  hmToMinSafe,
  ipMatchesRanges,
  normalizeRule,
  PUNCH_COOLDOWN_SECONDS,
  CAPABILITY_BY_ACTION,
  type AttendanceRule,
  type ShiftInfo,
} from "@/lib/hr/attendance-core";

export async function loadShiftFor(
  supabase: any,
  employeeId: string,
  dateStr: string,
): Promise<ShiftInfo | null> {
  const { data } = await supabase
    .from("employee_shifts")
    .select("effective_from, effective_to, shifts(name_ar, start_time, end_time, active)")
    .eq("employee_id", employeeId)
    .lte("effective_from", dateStr)
    .or(`effective_to.is.null,effective_to.gte.${dateStr}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const s = (
    data as {
      shifts?: { name_ar: string; start_time: string; end_time: string; active: boolean };
    } | null
  )?.shifts;
  if (!s || s.active === false) return null;
  return { name: s.name_ar, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) };
}

/**
 * Reduced/adjusted hours for a fixed calendar window — e.g. Ramadan (a Saudi
 * Labor Law requirement) or summer hours. Company-wide when department_id is
 * null, otherwise scoped to one department. Takes precedence over an
 * individual's regular shift.
 */
export async function loadSpecialPeriodFor(
  supabase: any,
  departmentId: string | null,
  dateStr: string,
): Promise<{ work_start: string; work_end: string } | null> {
  const { data } = await supabase
    .from("special_work_periods")
    .select("department_id, work_start, work_end")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);
  const rows = (data ?? []) as Array<{
    department_id: string | null;
    work_start: string;
    work_end: string;
  }>;
  if (!rows.length) return null;
  const match =
    rows.find((r) => r.department_id === departmentId) ??
    rows.find((r) => r.department_id === null);
  if (!match) return null;
  return { work_start: match.work_start.slice(0, 5), work_end: match.work_end.slice(0, 5) };
}

export async function loadRuleFor(
  _supabase: any,
  departmentId: string | null,
): Promise<AttendanceRule | null> {
  // Read via service role: attendance_rules contain anti-fraud config
  // (geo_lat/lng/radius, allowed_ip_ranges) that must not be exposed to
  // employees via RLS. The rule is only used server-side to validate
  // check-in/out; the sensitive fields never leave this function.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (departmentId) {
    const { data } = await supabaseAdmin
      .from("attendance_rules")
      .select("*")
      .eq("department_id", departmentId)
      .maybeSingle();
    if (data) return normalizeRule(data);
  }
  const { data } = await supabaseAdmin
    .from("attendance_rules")
    .select("*")
    .is("department_id", null)
    .maybeSingle();
  return data ? normalizeRule(data) : null;
}

/** Department rule with the employee's shift and any special period applied. */
export async function loadEffectiveRule(
  supabase: any,
  emp: { id: string; department_id: string | null },
  dateStr: string,
): Promise<{ rule: AttendanceRule | null; shift: ShiftInfo | null }> {
  const [rule, shift, special] = await Promise.all([
    loadRuleFor(supabase, emp.department_id),
    loadShiftFor(supabase, emp.id, dateStr),
    loadSpecialPeriodFor(supabase, emp.department_id, dateStr),
  ]);
  const withShift = applyShiftToRule(rule, shift);
  return { rule: applySpecialPeriodToRule(withShift, special), shift };
}

export interface TodayPermissions {
  /** Minutes-of-day until which arrival is excused (0 = none). */
  excuseUntilM: number;
  /** Minutes-of-day from which early checkout is permitted (null = none). */
  earlyLeaveFromM: number | null;
}

export async function loadTodayPermissions(
  supabase: any,
  employeeId: string,
  dateStr: string,
): Promise<TodayPermissions> {
  const { data } = await supabase
    .from("permission_requests")
    .select("type, from_time, to_time")
    .eq("employee_id", employeeId)
    .eq("request_date", dateStr)
    .eq("status", "approved");
  let excuseUntilM = 0;
  let earlyLeaveFromM: number | null = null;
  for (const r of (data ?? []) as Array<{ type: string; from_time: string; to_time: string }>) {
    if (r.type === "late_arrival" || r.type === "personal_excuse") {
      excuseUntilM = Math.max(excuseUntilM, hmToMinSafe(r.to_time, 0));
    }
    if (r.type === "early_leave") {
      const fromM = hmToMinSafe(r.from_time, 24 * 60);
      earlyLeaveFromM = earlyLeaveFromM == null ? fromM : Math.min(earlyLeaveFromM, fromM);
    }
  }
  return { excuseUntilM, earlyLeaveFromM };
}

// ---------------- Network (IP) restriction ----------------

export async function getClientIp(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    // Only trust cf-connecting-ip: the deployment edge sets it and strips any
    // client-supplied copy. x-forwarded-for is client-writable and forgeable.
    const raw = req?.headers.get("cf-connecting-ip") || "";
    return raw.split(",")[0].trim();
  } catch {
    return "";
  }
}

/** Throws unless the request comes from an allowed network (when configured). */
export async function assertAllowedNetwork(rule: AttendanceRule | null): Promise<{ ip: string }> {
  const ip = await getClientIp();
  const ranges = (
    (rule as { allowed_ip_ranges?: string[] } | null)?.allowed_ip_ranges ?? []
  ).filter(Boolean);
  if (ranges.length === 0) return { ip };
  if (!ipMatchesRanges(ip, ranges)) {
    const label = (rule as { network_label?: string | null } | null)?.network_label;
    throw new Error(
      label
        ? `التسجيل متاح فقط عبر شبكة «${label}» — أنت خارج الشبكة المعتمدة`
        : "التسجيل متاح فقط من شبكة العمل المعتمدة",
    );
  }
  return { ip };
}

// ---------------- Punch log ----------------
// Every physical press is recorded in attendance_punches. Within the check-in
// frame the FIRST punch is adopted; within the checkout frame the LAST one is.
// attendance_records stays the single adopted source of truth.

export async function assertPunchCooldown(supabase: any, employeeId: string) {
  const { data: last } = await supabase
    .from("attendance_punches")
    .select("punched_at")
    .eq("employee_id", employeeId)
    .order("punched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.punched_at) {
    const elapsed = (Date.now() - new Date(last.punched_at).getTime()) / 1000;
    if (elapsed < PUNCH_COOLDOWN_SECONDS) {
      const wait = Math.ceil(PUNCH_COOLDOWN_SECONDS - elapsed);
      throw new Error(`الرجاء الانتظار ${wait} ثانية قبل المحاولة التالية`);
    }
  }
}

export async function logPunch(
  supabase: any,
  punch: {
    employee_id: string;
    work_date: string;
    kind: "in" | "out";
    adopted: boolean;
    lat?: number | null;
    lng?: number | null;
    distance_m?: number | null;
    via_override?: boolean;
  },
) {
  // Last-out-wins: when adopting an 'out' punch, un-adopt earlier ones.
  if (punch.kind === "out" && punch.adopted) {
    await (supabase as any)
      .from("attendance_punches")
      .update({ adopted: false })
      .eq("employee_id", punch.employee_id)
      .eq("work_date", punch.work_date)
      .eq("kind", "out")
      .eq("adopted", true);
  }
  const { error } = await supabase.from("attendance_punches").insert({
    employee_id: punch.employee_id,
    work_date: punch.work_date,
    kind: punch.kind,
    adopted: punch.adopted,
    lat: punch.lat ?? null,
    lng: punch.lng ?? null,
    distance_m: punch.distance_m ?? null,
    via_override: punch.via_override ?? false,
  });
  if (error) console.error("[logPunch]", error);
}

// ---------------- Role / capability gates ----------------

export async function loadOverrideRole(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const set = new Set((data ?? []).map((r: any) => r.role));
  return set.has("hr_admin") || set.has("admin") || set.has("owner");
}

/**
 * One role gate for management-only attendance reads. Every caller used to
 * roll its own check, which is how the allowed-role lists drifted apart.
 */
export async function assertManagementRole(
  supabase: any,
  userId: string,
  allowed: string[],
): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (roles ?? []).map((r: any) => r.role as string);
  if (!list.some((r: string) => allowed.includes(r))) {
    throw new Error("هذا الإجراء يتطلب صلاحية إدارية");
  }
  return list;
}

export async function assertAttendanceEditor(
  supabase: any,
  userId: string,
  action: string,
  entityId?: string | null,
): Promise<string[]> {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = (roles ?? []).map((r: any) => r.role as string);
  const capability = CAPABILITY_BY_ACTION[action] ?? "attendance_edit";
  const { data: allowed } = await supabase.rpc("has_capability", {
    _user_id: userId,
    _capability: capability,
  });
  if (!allowed) {
    await supabase.from("security_audit_log").insert({
      entity_type: "attendance",
      entity_id: entityId ?? null,
      action: `denied:${action}`,
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { roles: list, capability },
    });
    throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء على الحضور");
  }
  return list;
}
