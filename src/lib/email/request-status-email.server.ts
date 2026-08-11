/**
 * Single place that turns a leave / permission status change into an email.
 *
 * Before this helper the same "load employee → resolve auth email → load
 * profile name → enqueue template" block was copy-pasted four times
 * (approve, reject, cancel × leave, permission), which is exactly how the
 * variants drifted apart. All callers now go through one function per
 * entity; failures are logged and never break the reviewing transaction.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueApprovalEmail } from "@/lib/email/send-approval-email.server";

export type RequestAction = "approve" | "reject" | "cancel";

const PERMISSION_TYPE_LABELS: Record<string, string> = {
  late_arrival: "تأخر مبرر",
  early_leave: "خروج مبكر",
  personal_excuse: "استئذان شخصي",
  makeup_hours: "تعويض ساعات",
};

async function recipientFor(employeeId: string) {
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp?.user_id) return null;
  const { data: uinfo } = await supabaseAdmin.auth.admin.getUserById(emp.user_id);
  const email = uinfo?.user?.email;
  if (!email) return null;
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", emp.user_id)
    .maybeSingle();
  return { email, name: (prof as { full_name?: string } | null)?.full_name ?? undefined };
}

export async function notifyLeaveStatusEmail(opts: {
  leaveId: string;
  action: RequestAction;
  note?: string | null;
  actorUserId: string | null;
}) {
  try {
    const { data: req } = await supabaseAdmin
      .from("leave_requests")
      .select("employee_id, leave_type_id, start_date, end_date, days")
      .eq("id", opts.leaveId)
      .maybeSingle();
    if (!req) return;
    const to = await recipientFor(req.employee_id);
    if (!to) return;
    const { data: lt } = await supabaseAdmin
      .from("leave_types")
      .select("name_ar")
      .eq("id", req.leave_type_id)
      .maybeSingle();

    await enqueueApprovalEmail({
      supabaseAdmin,
      templateName:
        opts.action === "approve"
          ? "leave-approved"
          : opts.action === "reject"
            ? "leave-rejected"
            : "leave-cancelled",
      recipientEmail: to.email,
      templateData: {
        employeeName: to.name,
        leaveType: (lt as { name_ar?: string } | null)?.name_ar ?? undefined,
        startDate: req.start_date,
        endDate: req.end_date,
        days: Number(req.days),
        note: opts.note ?? null,
      },
      idempotencyKey: `leave-${opts.action}-${opts.leaveId}`,
      entityType: "leave_request",
      entityId: opts.leaveId,
      actorUserId: opts.actorUserId,
    });
  } catch (e) {
    console.error("leave status email failed", e);
  }
}

export async function notifyPermissionStatusEmail(opts: {
  permissionId: string;
  action: RequestAction;
  note?: string | null;
  actorUserId: string | null;
}) {
  try {
    const { data: req } = await supabaseAdmin
      .from("permission_requests")
      .select("employee_id, type, request_date, from_time, to_time")
      .eq("id", opts.permissionId)
      .maybeSingle();
    if (!req) return;
    const to = await recipientFor(req.employee_id);
    if (!to) return;

    await enqueueApprovalEmail({
      supabaseAdmin,
      templateName:
        opts.action === "approve"
          ? "permission-approved"
          : opts.action === "reject"
            ? "permission-rejected"
            : "permission-cancelled",
      recipientEmail: to.email,
      templateData: {
        employeeName: to.name,
        permissionType: PERMISSION_TYPE_LABELS[req.type] || req.type,
        requestDate: req.request_date,
        fromTime: String(req.from_time).slice(0, 5),
        toTime: String(req.to_time).slice(0, 5),
        note: opts.note ?? null,
      },
      idempotencyKey: `perm-${opts.action}-${opts.permissionId}`,
      entityType: "permission_request",
      entityId: opts.permissionId,
      actorUserId: opts.actorUserId,
    });
  } catch (e) {
    console.error("permission status email failed", e);
  }
}
