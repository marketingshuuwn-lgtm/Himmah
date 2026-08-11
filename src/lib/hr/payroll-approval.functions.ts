// Payroll approval workflow.
//
// draft -> pending_admin_approval -> approved -> sent_to_employee
//       -> employee_approved | employee_objected (objection cycles back
//          to draft once HR corrects and regenerates via generatePayroll)
//
// The employee's decision reuses the existing payroll_disputes channel
// for objections (openPayrollDispute) — this module adds the missing
// pieces: HR requesting sign-off, HR approving + sending, the employee's
// explicit "اعتماد" action, and the HR-configurable auto-generation day.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

async function assertHR(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const set = new Set((roles ?? []).map((r: { role: string }) => r.role));
  if (!set.has("hr_admin") && !set.has("accountant")) {
    throw new Error("Forbidden: hr_admin or accountant role required");
  }
}

const periodInput = z.object({ period_month: z.string().min(7) });

/**
 * HR/accountant marks a period's draft runs as ready for admin/HR
 * sign-off. Purely a status transition — no data changes.
 */
export const requestPayrollApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertHR(supabase, userId);

    const { data: updated, error } = await supabase
      .from("payroll_runs")
      .update({ approval_status: "pending_admin_approval" })
      .eq("period_month", data.period_month)
      .eq("approval_status", "draft")
      .select("id");
    if (error) throw mapDbError(error);

    await supabase.from("security_audit_log").insert({
      entity_type: "payroll_run",
      entity_id: null,
      action: "request_approval",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { period_month: data.period_month, affected: updated?.length ?? 0 },
    });

    return { affected: updated?.length ?? 0 };
  });

/**
 * The actual sign-off: HR/admin approves the period's pending runs and
 * immediately sends them to employees in one step (matching how HR
 * naturally thinks of "اعتماد وإرسال" as a single action) — notifying
 * each employee individually.
 */
export const approveAndSendPayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => periodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertHR(supabase, userId);

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("payroll_runs")
      .update({
        approval_status: "sent_to_employee",
        approved_by: userId,
        approved_at: now,
      })
      .eq("period_month", data.period_month)
      .in("approval_status", ["pending_admin_approval", "draft"])
      .select("id, employee_id, net_salary");
    if (error) throw mapDbError(error);

    const rows = updated ?? [];
    if (rows.length) {
      const empIds = rows.map((r: { employee_id: string }) => r.employee_id);
      const { data: emps } = await supabase
        .from("employees")
        .select("id, user_id")
        .in("id", empIds);
      const userByEmp = new Map(
        (emps ?? []).map((e: { id: string; user_id: string }) => [e.id, e.user_id]),
      );
      const notes = rows
        .map((r: { employee_id: string; net_salary: number }) => {
          const uid = userByEmp.get(r.employee_id);
          if (!uid) return null;
          return {
            user_id: uid,
            kind: "payroll" as const,
            title: "قسيمة راتبك جاهزة",
            body: `صافي الراتب: ${Number(r.net_salary).toFixed(2)} — يرجى المراجعة والاعتماد.`,
            link: "/payroll",
          };
        })
        .filter(Boolean);
      if (notes.length) await supabase.from("notifications").insert(notes as never);
    }

    await supabase.from("security_audit_log").insert({
      entity_type: "payroll_run",
      entity_id: null,
      action: "approve_and_send",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: { period_month: data.period_month, affected: rows.length },
    });

    return { affected: rows.length };
  });

const runIdInput = z.object({ payroll_run_id: z.string().uuid() });

/**
 * The employee's explicit confirmation that their payslip is correct.
 * Final state — objecting instead goes through openPayrollDispute.
 */
export const employeeApprovePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => runIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("لا يوجد ملف موظف لهذا الحساب");

    const { data: run } = await supabase
      .from("payroll_runs")
      .select("id, employee_id, approval_status, period_month")
      .eq("id", data.payroll_run_id)
      .maybeSingle();
    if (!run || run.employee_id !== emp.id) throw new Error("قسيمة غير موجودة");
    if (run.approval_status !== "sent_to_employee") {
      throw new Error("لا يمكن اعتماد هذه القسيمة في حالتها الحالية");
    }

    const { error } = await supabase
      .from("payroll_runs")
      .update({
        approval_status: "employee_approved",
        employee_decided_at: new Date().toISOString(),
      })
      .eq("id", data.payroll_run_id);
    if (error) throw mapDbError(error);

    // Notify HR — a quiet confirmation shouldn't require them to go check.
    const { data: hrRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "hr_admin");
    const recipients = Array.from(
      new Set((hrRoles ?? []).map((r: { user_id: string }) => r.user_id)),
    );
    if (recipients.length) {
      await supabase.from("notifications").insert(
        recipients.map((uid) => ({
          user_id: uid,
          kind: "success" as const,
          title: "اعتماد قسيمة راتب",
          body: `اعتمد الموظف قسيمة راتبه لشهر ${run.period_month}.`,
          link: "/payroll",
        })),
      );
    }

    return { ok: true };
  });

// ---------------- HR-configurable auto-generation schedule ----------------

export interface PayrollSettingsRow {
  auto_generate_day: number;
  auto_request_approval: boolean;
}

export const getPayrollSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayrollSettingsRow> => {
    await assertHR(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("payroll_settings")
      .select("auto_generate_day, auto_request_approval")
      .eq("id", true)
      .maybeSingle();
    return {
      auto_generate_day: data?.auto_generate_day ?? 25,
      auto_request_approval: data?.auto_request_approval ?? true,
    };
  });

const settingsInput = z.object({
  auto_generate_day: z.number().int().min(1).max(28),
  auto_request_approval: z.boolean(),
});

export const updatePayrollSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isHR = (roles ?? []).some((r: { role: string }) => r.role === "hr_admin");
    if (!isHR) throw new Error("Forbidden: hr_admin role required");

    const { error } = await supabase
      .from("payroll_settings")
      .update({
        auto_generate_day: data.auto_generate_day,
        auto_request_approval: data.auto_request_approval,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw mapDbError(error);

    await supabase.from("security_audit_log").insert({
      entity_type: "payroll_settings",
      entity_id: null,
      action: "update",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: data,
    });

    return { ok: true };
  });
