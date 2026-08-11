import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";
import { countLeaveDays } from "@/lib/hr/time";

export type LeaveStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveTypeRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  default_annual_days: number;
  is_paid: boolean;
  requires_attachment: boolean;
  color: string;
  active: boolean;
}

export interface LeaveRequestRow {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type_id: string;
  leave_type_name: string;
  leave_type_color: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  attachment_path: string | null;
  status: LeaveStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface LeaveBalanceRow {
  leave_type_id: string;
  leave_type_name: string;
  color: string;
  entitled_days: number;
  used_days: number;
  remaining: number;
}

async function resolveEmpIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export const listLeaveTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveTypeRow[]> => {
    const { data, error } = await context.supabase
      .from("leave_types")
      .select("*")
      .eq("active", true)
      .order("name_ar");
    if (error) throw mapDbError(error);
    return (data ?? []) as LeaveTypeRow[];
  });

export const listLeaveRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: z.enum(["mine", "all"]).default("mine") }).parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<LeaveRequestRow[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("leave_requests")
      .select(
        "id, employee_id, leave_type_id, start_date, end_date, days, reason, attachment_path, status, review_note, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (data.scope === "mine") {
      const empId = await resolveEmpIdForUser(supabase, userId);
      if (!empId) return [];
      q = q.eq("employee_id", empId);
    }
    const { data: rows, error } = await q;
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((rows ?? []).map((r) => r.employee_id)));
    const typeIds = Array.from(new Set((rows ?? []).map((r) => r.leave_type_id)));
    const [{ data: emps }, { data: types }] = await Promise.all([
      empIds.length
        ? supabase.from("employees").select("id, user_id").in("id", empIds)
        : Promise.resolve({ data: [] as any[] }),
      typeIds.length
        ? supabase.from("leave_types").select("id, name_ar, color").in("id", typeIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const userIds = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const typeMap = new Map((types ?? []).map((t: any) => [t.id, t]));

    return (rows ?? []).map((r) => {
      const uid = empMap.get(r.employee_id);
      const t = typeMap.get(r.leave_type_id) as any;
      return {
        ...r,
        days: Number(r.days),
        employee_name: (uid && profMap.get(uid)) || "—",
        leave_type_name: t?.name_ar ?? "—",
        leave_type_color: t?.color ?? "#64748b",
      } as LeaveRequestRow;
    });
  });

export const myLeaveBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveBalanceRow[]> => {
    const { supabase, userId } = context;
    const empId = await resolveEmpIdForUser(supabase, userId);
    if (!empId) return [];
    const year = new Date().getFullYear();

    const [{ data: types }, { data: balances }, { data: approved }] = await Promise.all([
      supabase
        .from("leave_types")
        .select("id, name_ar, color, default_annual_days")
        .eq("active", true),
      supabase
        .from("leave_balances")
        .select("leave_type_id, entitled_days, used_days, carried_over")
        .eq("employee_id", empId)
        .eq("year", year),
      supabase
        .from("leave_requests")
        .select("leave_type_id, days")
        .eq("employee_id", empId)
        .eq("status", "approved")
        .gte("start_date", `${year}-01-01`)
        .lte("end_date", `${year}-12-31`),
    ]);

    const balMap = new Map((balances ?? []).map((b: any) => [b.leave_type_id, b]));
    const usedMap = new Map<string, number>();
    (approved ?? []).forEach((a: any) =>
      usedMap.set(a.leave_type_id, (usedMap.get(a.leave_type_id) ?? 0) + Number(a.days)),
    );

    return (types ?? []).map((t: any) => {
      const b = balMap.get(t.id) as any;
      const entitled =
        Number(b?.entitled_days ?? t.default_annual_days) + Number(b?.carried_over ?? 0);
      // `used_days` is kept in sync by a DB trigger, but we still take the
      // max against a live recount so a stale/missing balance row can never
      // understate consumption.
      const used = Math.max(Number(b?.used_days ?? 0), usedMap.get(t.id) ?? 0);
      return {
        leave_type_id: t.id,
        leave_type_name: t.name_ar,
        color: t.color,
        entitled_days: entitled,
        used_days: used,
        remaining: Math.max(0, entitled - used),
      };
    });

  });

const createSchema = z.object({
  leave_type_id: z.string().uuid(),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  reason: z.string().max(1000).optional().nullable(),
  attachment_path: z.string().max(300).optional().nullable(),
});

export const createLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const empId = await resolveEmpIdForUser(supabase, userId);
    if (!empId) throw new Error("لا يوجد ملف موظف لهذا الحساب");

    // Attachment path must live under this user's own folder — same
    // enforcement pattern already used for documents/selfies.
    if (data.attachment_path && !data.attachment_path.startsWith(`${userId}/`)) {
      throw new Error("مسار المرفق غير صالح");
    }

    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end < start) throw new Error("تاريخ النهاية قبل البداية");
    // Deduct only the days the approval actually marks as leave: the
    // approve_leave_request RPC skips Fri/Sat, so counting calendar days here
    // would charge the balance for days nobody was expected to work.
    const days = countLeaveDays(data.start_date, data.end_date);
    if (days <= 0) throw new Error("الفترة المختارة لا تحتوي على أيام عمل");

    const { error } = await supabase.from("leave_requests").insert({
      employee_id: empId,
      leave_type_id: data.leave_type_id,
      start_date: data.start_date,
      end_date: data.end_date,
      days,
      reason: data.reason || null,
      attachment_path: data.attachment_path || null,
      status: "pending",
    });
    if (error) throw mapDbError(error);
    return { ok: true, days };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export const reviewLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Defense in depth: enforce role server-side (in addition to RLS).
    const { data: canReview } = await supabase.rpc("can_review_requests", { _user_id: userId });
    if (!canReview) throw new Error("Forbidden: insufficient role to review leave requests");

    // Load the request first — we need its dates for leave-day marking,
    // and we must not re-review an already-reviewed request.
    const { data: req, error: reqErr } = await supabase
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, days, leave_type_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (reqErr) throw mapDbError(reqErr);
    if (!req) throw new Error("الطلب غير موجود");
    if (req.status !== "pending") {
      throw new Error("تمت مراجعة هذا الطلب مسبقاً");
    }

    if (data.action === "approve") {
      // Atomic: status transition + leave-day attendance marking happen in a
      // single DB transaction (approve_leave_request). Either both commit or
      // neither does — no more "approved but unmarked" half state.
      const { error: rpcErr } = await supabase.rpc("approve_leave_request", {
        _id: data.id,
        _note: data.note || undefined,
      });
      if (rpcErr) throw mapDbError(rpcErr);
    } else {
      // Guarded update: only transitions out of 'pending' (prevents double-review races).
      const { data: updated, error } = await supabase
        .from("leave_requests")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_note: data.note || null,
        })
        .eq("id", data.id)
        .eq("status", "pending")
        .select("id");
      if (error) throw mapDbError(error);
      if (!updated?.length) throw new Error("تمت مراجعة هذا الطلب مسبقاً");
    }


    // Explicit audit entry (trigger also logs status change).
    await supabase.from("security_audit_log").insert({
      entity_type: "leave_request",
      entity_id: data.id,
      action: data.action === "approve" ? "approve" : "reject",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { note: data.note ?? null },
    });

    // Notify employee (in-app + email)
    if (req) {
      const { data: emp } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", req.employee_id)
        .single();
      if (emp) {
        await supabase.from("notifications").insert({
          user_id: emp.user_id,
          kind: "leave",
          title: data.action === "approve" ? "تمت الموافقة على طلب الإجازة" : "تم رفض طلب الإجازة",
          body: data.note || null,
          link: "/leaves",
        });

        const { notifyLeaveStatusEmail } = await import(
          "@/lib/email/request-status-email.server"
        );
        await notifyLeaveStatusEmail({
          leaveId: data.id,
          action: data.action === "approve" ? "approve" : "reject",
          note: data.note ?? null,
          actorUserId: userId,
        });

      }
    }
    return { ok: true };
  });

export const cancelLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Verify ownership server-side (defense in depth alongside RLS).
    const { data: req, error: fetchErr } = await supabase
      .from("leave_requests")
      .select("id, employee_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw mapDbError(fetchErr);
    if (!req) throw new Error("الطلب غير موجود");

    const empId = await resolveEmpIdForUser(supabase, userId);
    if (!empId || empId !== req.employee_id) {
      throw new Error("Forbidden: يمكنك إلغاء طلباتك فقط");
    }
    if (req.status !== "pending") {
      throw new Error("لا يمكن إلغاء طلب تمّت مراجعته");
    }

    const { error } = await supabase
      .from("leave_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw mapDbError(error);

    await supabase.from("security_audit_log").insert({
      entity_type: "leave_request",
      entity_id: data.id,
      action: "cancel",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { employee_id: req.employee_id },
    });

    const { notifyLeaveStatusEmail } = await import("@/lib/email/request-status-email.server");
    await notifyLeaveStatusEmail({ leaveId: data.id, action: "cancel", actorUserId: userId });
    return { ok: true };
  });

/**
 * Cancel an ALREADY-APPROVED leave (management only).
 *
 * Runs through the `cancel_approved_leave` RPC so the status change, the
 * removal of the auto-created "leave" attendance days and the balance
 * recalculation all happen in one transaction — previously the only way out
 * of a wrongly approved leave was editing attendance day by day.
 */
export const cancelApprovedLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).optional().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { error: rpcErr } = await supabase.rpc("cancel_approved_leave", {
      _id: data.id,
      _note: data.note || undefined,
    });
    if (rpcErr) throw mapDbError(rpcErr);

    await supabase.from("security_audit_log").insert({
      entity_type: "leave_request",
      entity_id: data.id,
      action: "cancel_approved",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { note: data.note ?? null },
    });

    const { data: req } = await supabase
      .from("leave_requests")
      .select("employee_id")
      .eq("id", data.id)
      .maybeSingle();
    if (req) {
      const { data: emp } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", req.employee_id)
        .maybeSingle();
      if (emp) {
        await supabase.from("notifications").insert({
          user_id: emp.user_id,
          kind: "leave",
          title: "تم إلغاء إجازة معتمدة",
          body: data.note || "تم إلغاء الإجازة وإرجاع الرصيد.",
          link: "/leaves",
        });
      }
    }

    const { notifyLeaveStatusEmail } = await import("@/lib/email/request-status-email.server");
    await notifyLeaveStatusEmail({
      leaveId: data.id,
      action: "cancel",
      note: data.note ?? null,
      actorUserId: userId,
    });
    return { ok: true };
  });

