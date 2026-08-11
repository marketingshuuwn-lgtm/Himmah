import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export type PermissionType = "late_arrival" | "early_leave" | "personal_excuse" | "makeup_hours";
export type PermissionStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface PermissionRow {
  id: string;
  employee_id: string;
  employee_name: string;
  type: PermissionType;
  request_date: string;
  from_time: string;
  to_time: string;
  duration_minutes: number;
  reason: string;
  attachment_path: string | null;
  status: PermissionStatus;
  review_note: string | null;
  created_at: string;
}

export const permissionLabels: Record<PermissionType, string> = {
  late_arrival: "تأخر مبرر",
  early_leave: "خروج مبكر",
  personal_excuse: "استئذان شخصي",
  makeup_hours: "تعويض ساعات",
};

async function resolveEmpIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export const listPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: z.enum(["mine", "all"]).default("mine") }).parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<PermissionRow[]> => {
    const { supabase, userId } = context;
    // Attendance-correction requests share this table but have their own
    // review screen, so the permissions list only shows real permissions.
    let q = supabase
      .from("permission_requests")
      .select("*")
      .eq("kind", "permission")
      .order("created_at", { ascending: false });

    if (data.scope === "mine") {
      const empId = await resolveEmpIdForUser(supabase, userId);
      if (!empId) return [];
      q = q.eq("employee_id", empId);
    }
    const { data: rows, error } = await q;
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((rows ?? []).map((r: any) => r.employee_id)));
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, user_id").in("id", empIds)
      : { data: [] as any[] };
    const userIds = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

    return (rows ?? []).map((r: any) => ({
      ...r,
      employee_name: (profMap.get(empMap.get(r.employee_id)!) as string) || "—",
    })) as PermissionRow[];
  });

const createSchema = z.object({
  type: z.enum(["late_arrival", "early_leave", "personal_excuse", "makeup_hours"]),
  request_date: z.string().min(10),
  from_time: z.string().regex(/^\d{2}:\d{2}$/),
  to_time: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().min(3).max(500),
  attachment_path: z.string().max(300).optional().nullable(),
});

export const createPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const empId = await resolveEmpIdForUser(supabase, userId);
    if (!empId) throw new Error("لا يوجد ملف موظف لهذا الحساب");

    if (data.attachment_path && !data.attachment_path.startsWith(`${userId}/`)) {
      throw new Error("مسار المرفق غير صالح");
    }

    const [fH, fM] = data.from_time.split(":").map(Number);
    const [tH, tM] = data.to_time.split(":").map(Number);
    const duration = tH * 60 + tM - (fH * 60 + fM);
    if (duration <= 0) throw new Error("وقت النهاية يجب أن يكون بعد البداية");

    const { error } = await supabase.from("permission_requests").insert({
      employee_id: empId,
      type: data.type,
      request_date: data.request_date,
      from_time: data.from_time + ":00",
      to_time: data.to_time + ":00",
      duration_minutes: duration,
      reason: data.reason,
      attachment_path: data.attachment_path || null,
    });
    if (error) throw mapDbError(error);
    return { ok: true };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export const reviewPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: canReview } = await supabase.rpc("can_review_requests", { _user_id: userId });
    if (!canReview) throw new Error("Forbidden: insufficient role to review permission requests");

    // Guarded update: only a still-pending request can transition, so two
    // concurrent reviewers can never both process the same request.
    const { data: reviewed, error } = await supabase
      .from("permission_requests")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note || null,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");
    if (error) throw mapDbError(error);
    if (!reviewed?.length) throw new Error("تمت مراجعة هذا الطلب مسبقاً");


    await supabase.from("security_audit_log").insert({
      entity_type: "permission_request",
      entity_id: data.id,
      action: data.action === "approve" ? "approve" : "reject",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { note: data.note ?? null },
    });

    const { data: req } = await supabase
      .from("permission_requests")
      .select("employee_id, type, request_date, from_time, to_time")
      .eq("id", data.id)
      .single();
    if (req) {
      const { data: emp } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", req.employee_id)
        .single();
      if (emp) {
        await supabase.from("notifications").insert({
          user_id: emp.user_id,
          kind: "permission",
          title: data.action === "approve" ? "تمت الموافقة على طلب الإذن" : "تم رفض طلب الإذن",
          body: data.note || null,
          link: "/permissions",
        });

        const { notifyPermissionStatusEmail } = await import(
          "@/lib/email/request-status-email.server"
        );
        await notifyPermissionStatusEmail({
          permissionId: data.id,
          action: data.action === "approve" ? "approve" : "reject",
          note: data.note ?? null,
          actorUserId: userId,
        });

      }
    }
    return { ok: true };
  });

export const cancelPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: req, error: fetchErr } = await supabase
      .from("permission_requests")
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
      .from("permission_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw mapDbError(error);

    await supabase.from("security_audit_log").insert({
      entity_type: "permission_request",
      entity_id: data.id,
      action: "cancel",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { employee_id: req.employee_id },
    });

    const { notifyPermissionStatusEmail } = await import(
      "@/lib/email/request-status-email.server"
    );
    await notifyPermissionStatusEmail({
      permissionId: data.id,
      action: "cancel",
      actorUserId: userId,
    });
    return { ok: true };
  });

