import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "hr_admin",
  });
  if (error) throw mapDbError(error);
  if (!data) throw new Error("ليست لديك صلاحية للقيام بعمليات جماعية");
}

// ---------- Employees bulk ----------
const bulkEmpUpdate = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  department_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "on_leave", "terminated"]).optional(),
  salary_action: z.enum(["set", "add_pct", "add_amount"]).optional(),
  salary_value: z.number().min(-1_000_000).max(10_000_000).optional(),
  allowances_action: z.enum(["set", "add_pct", "add_amount"]).optional(),
  allowances_value: z.number().min(-1_000_000).max(10_000_000).optional(),
});

export const bulkUpdateEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkEmpUpdate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Simple field updates (dept / status) — can run in single update
    const simple: Record<string, unknown> = {};
    if (data.department_id !== undefined) simple.department_id = data.department_id;
    if (data.status) simple.status = data.status;

    if (Object.keys(simple).length) {
      const { error } = await (context.supabase.from("employees") as any)
        .update(simple)
        .in("id", data.ids);
      if (error) throw mapDbError(error);
    }

    // Salary / allowances need per-row math if % or +amount
    if (data.salary_action || data.allowances_action) {
      const { data: rows, error: e1 } = await context.supabase
        .from("employees")
        .select("id, base_salary, allowances")
        .in("id", data.ids);
      if (e1) throw mapDbError(e1);

      for (const r of rows ?? []) {
        const patch: Record<string, number> = {};
        if (data.salary_action && data.salary_value !== undefined) {
          const cur = Number(r.base_salary) || 0;
          patch.base_salary =
            data.salary_action === "set" ? data.salary_value
            : data.salary_action === "add_amount" ? cur + data.salary_value
            : cur + (cur * data.salary_value) / 100;
          if (patch.base_salary < 0) patch.base_salary = 0;
        }
        if (data.allowances_action && data.allowances_value !== undefined) {
          const cur = Number(r.allowances) || 0;
          patch.allowances =
            data.allowances_action === "set" ? data.allowances_value
            : data.allowances_action === "add_amount" ? cur + data.allowances_value
            : cur + (cur * data.allowances_value) / 100;
          if (patch.allowances < 0) patch.allowances = 0;
        }
        const { error } = await (context.supabase.from("employees") as any)
          .update(patch)
          .eq("id", r.id);
        if (error) throw mapDbError(error);
      }
    }

    return { ok: true, count: data.ids.length };
  });

const importRow = z.object({
  user_id: z.string().uuid(),
  employee_no: z.string().min(1).max(40),
  position: z.string().max(120).optional().default(""),
  department_id: z.string().uuid().nullable().optional(),
  base_salary: z.number().min(0).max(10_000_000).default(0),
  allowances: z.number().min(0).max(10_000_000).default(0),
  hire_date: z.string().min(10),
  status: z.enum(["active", "on_leave", "terminated"]).default("active"),
});

export const bulkImportEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(importRow).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = data.rows.map((r) => ({
      user_id: r.user_id,
      employee_no: r.employee_no,
      position: r.position ?? "",
      department_id: r.department_id ?? null,
      base_salary: r.base_salary,
      allowances: r.allowances,
      hire_date: r.hire_date,
      status: r.status,
    }));
    const { error } = await context.supabase.from("employees").insert(payload);
    if (error) throw mapDbError(error);
    return { ok: true, count: payload.length };
  });

// ---------- Contracts bulk ----------
export const bulkUpdateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      action: z.enum(["send", "cancel"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch = data.action === "send"
      ? { status: "sent" as const, sent_at: new Date().toISOString() }
      : { status: "cancelled" as const };

    // For "send", only allow drafts → sent
    let q = context.supabase.from("contracts").update(patch).in("id", data.ids);
    if (data.action === "send") q = q.eq("status", "draft");
    else q = q.in("status", ["draft", "sent"]);
    const { error } = await q;
    if (error) throw mapDbError(error);

    // Audit log
    const audit = data.ids.map((id) => ({
      contract_id: id,
      actor_id: context.userId,
      event: data.action === "send" ? "sent" : "cancelled",
      details: { bulk: true },
    }));
    await context.supabase.from("contract_audit_log").insert(audit);
    return { ok: true, count: data.ids.length };
  });

const bulkIssueInput = z.object({
  template_id: z.string().uuid(),
  employee_ids: z.array(z.string().uuid()).min(1).max(200),
  title_prefix: z.string().max(120).optional(),
  send_immediately: z.boolean().default(false),
  data: z.record(z.string(), z.string()).default({}),
});

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export const bulkIssueContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkIssueInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: tpl, error: et } = await context.supabase
      .from("contract_templates")
      .select("id, name, body")
      .eq("id", data.template_id)
      .single();
    if (et || !tpl) throw new Error("القالب غير موجود");

    // Resolve employee names for personalization
    const { data: emps } = await context.supabase
      .from("employees")
      .select("id, user_id, employee_no")
      .in("id", data.employee_ids);
    const uids = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = uids.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", uids)
      : { data: [] as any[] };
    const pm = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name as string]));

    const now = new Date().toISOString();
    const rows = (emps ?? []).map((e: any) => {
      const vars = {
        ...data.data,
        employee_name: pm.get(e.user_id) ?? "",
        employee_no: e.employee_no ?? "",
        issue_date: now.slice(0, 10),
      };
      const body = renderTemplate(tpl.body, vars);
      const title = `${data.title_prefix ?? tpl.name} — ${pm.get(e.user_id) ?? e.employee_no}`;
      return {
        template_id: tpl.id,
        employee_id: e.id,
        title,
        body,
        data: vars,
        status: data.send_immediately ? "sent" as const : "draft" as const,
        sent_at: data.send_immediately ? now : null,
        created_by: context.userId,
      };
    });

    if (!rows.length) return { ok: true, count: 0 };

    const { data: inserted, error } = await context.supabase
      .from("contracts")
      .insert(rows)
      .select("id");
    if (error) throw mapDbError(error);

    const audit = (inserted ?? []).map((r: any) => ({
      contract_id: r.id,
      actor_id: context.userId,
      event: data.send_immediately ? "sent" : "created",
      details: { bulk: true, template: tpl.name },
    }));
    if (audit.length) await context.supabase.from("contract_audit_log").insert(audit);

    return { ok: true, count: rows.length };
  });

// ---------- Leaves bulk ----------
export const bulkReviewLeaves = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1).max(500),
      action: z.enum(["approve", "reject"]),
      note: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // hr_admin OR dept_manager allowed
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "hr_admin",
    });
    const { data: isMgr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "dept_manager",
    });
    if (!isAdmin && !isMgr) throw new Error("صلاحية مراجعة الإجازات مطلوبة");

    const status = data.action === "approve" ? "approved" : "rejected";
    const { error } = await context.supabase
      .from("leave_requests")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note || null,
      })
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw mapDbError(error);

    // Notifications
    const { data: reqs } = await context.supabase
      .from("leave_requests")
      .select("id, employee_id")
      .in("id", data.ids);
    const empIds = Array.from(new Set((reqs ?? []).map((r: any) => r.employee_id)));
    const { data: emps } = empIds.length
      ? await context.supabase.from("employees").select("id, user_id").in("id", empIds)
      : { data: [] as any[] };
    const userIdByEmp = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const notifs = (reqs ?? [])
      .map((r: any) => userIdByEmp.get(r.employee_id))
      .filter(Boolean)
      .map((uid: string) => ({
        user_id: uid,
        kind: "leave" as const,
        title: data.action === "approve" ? "تمت الموافقة على طلب الإجازة" : "تم رفض طلب الإجازة",
        body: data.note || null,
        link: "/leaves",
      }));
    if (notifs.length) await context.supabase.from("notifications").insert(notifs);

    return { ok: true, count: data.ids.length };
  });

export const bulkAdjustLeaveBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      employee_ids: z.array(z.string().uuid()).min(1).max(500),
      leave_type_id: z.string().uuid(),
      year: z.number().int().min(2000).max(2100),
      action: z.enum(["set", "add"]),
      days: z.number().min(-365).max(365),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    for (const empId of data.employee_ids) {
      const { data: existing } = await context.supabase
        .from("leave_balances")
        .select("id, entitled_days")
        .eq("employee_id", empId)
        .eq("leave_type_id", data.leave_type_id)
        .eq("year", data.year)
        .maybeSingle();

      const next = data.action === "set"
        ? data.days
        : Number(existing?.entitled_days ?? 0) + data.days;

      if (existing) {
        const { error } = await context.supabase
          .from("leave_balances")
          .update({ entitled_days: next })
          .eq("id", existing.id);
        if (error) throw mapDbError(error);
      } else {
        const { error } = await context.supabase.from("leave_balances").insert({
          employee_id: empId,
          leave_type_id: data.leave_type_id,
          year: data.year,
          entitled_days: next,
          used_days: 0,
        });
        if (error) throw mapDbError(error);
      }
    }
    return { ok: true, count: data.employee_ids.length };
  });
