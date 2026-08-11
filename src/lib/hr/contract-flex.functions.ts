import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mapDbError } from "@/lib/hr/db-errors";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** A single, freely editable contract clause. */
export interface ClauseRow {
  id: string;
  title: string;
  body: string;
}

/** Per-contract approval path — which steps are actually required. */
export interface ApprovalFlow {
  require_manager_approval: boolean;
  require_biometric: boolean;
  notify_by_email: boolean;
}

export const DEFAULT_APPROVAL_FLOW: ApprovalFlow = {
  require_manager_approval: false,
  require_biometric: false,
  notify_by_email: true,
};

export function normalizeFlow(raw: unknown): ApprovalFlow {
  const o = (raw ?? {}) as Partial<Record<keyof ApprovalFlow, unknown>>;
  return {
    require_manager_approval: o.require_manager_approval === true,
    require_biometric: o.require_biometric === true,
    notify_by_email: o.notify_by_email !== false,
  };
}

const clauseSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  body: z.string().max(20000),
});

type Ctx = { supabase: SupabaseLike; userId: string };
type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>;
};

/** Contract management is HR/owner/admin territory. */
async function assertContractManager(context: Ctx) {
  for (const role of ["hr_admin", "owner", "admin"]) {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: role,
    });
    if (data === true) return;
  }
  throw new Error("غير مصرح لك بإدارة العقود");
}

// ---------- Clauses ----------

export const getContractFlex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contract_id: string }) =>
    z.object({ contract_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contracts")
      .select(
        "id, title, status, clauses, approval_flow, manager_approved_at, kind, parent_contract_id",
      )
      .eq("id", data.contract_id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!row) throw new Error("العقد غير موجود");

    const { data: addenda } = await context.supabase
      .from("contracts")
      .select("id, title, status, created_at, signed_at")
      .eq("parent_contract_id", data.contract_id)
      .order("created_at", { ascending: true });

    return {
      id: row.id as string,
      title: row.title as string,
      status: row.status as string,
      kind: (row.kind as string) ?? "original",
      parent_contract_id: (row.parent_contract_id as string | null) ?? null,
      clauses: (Array.isArray(row.clauses) ? row.clauses : []) as unknown as ClauseRow[],
      approval_flow: normalizeFlow(row.approval_flow),
      manager_approved_at: (row.manager_approved_at as string | null) ?? null,
      addenda: (addenda ?? []) as {
        id: string;
        title: string;
        status: string;
        created_at: string;
        signed_at: string | null;
      }[],
    };
  });

export const saveContractClauses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contract_id: string; clauses: ClauseRow[]; body: string }) =>
    z
      .object({
        contract_id: z.string().uuid(),
        clauses: z.array(clauseSchema).max(100),
        body: z.string().max(200000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContractManager(context as unknown as Ctx);

    const { data: current, error: readErr } = await context.supabase
      .from("contracts")
      .select("status")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (readErr) throw mapDbError(readErr);
    if (!current) throw new Error("العقد غير موجود");
    if (current.status !== "draft") {
      throw new Error("لا يمكن تعديل البنود بعد إرسال العقد — أنشئ ملحقًا بدلًا من ذلك");
    }

    const { error } = await context.supabase
      .from("contracts")
      .update({ clauses: data.clauses, body: data.body })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "clauses_updated",
      details: { count: data.clauses.length },
    });

    return { ok: true };
  });

// ---------- Approval flow ----------

export const setApprovalFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contract_id: string; flow: ApprovalFlow }) =>
    z
      .object({
        contract_id: z.string().uuid(),
        flow: z.object({
          require_manager_approval: z.boolean(),
          require_biometric: z.boolean(),
          notify_by_email: z.boolean(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContractManager(context as unknown as Ctx);
    const { error } = await context.supabase
      .from("contracts")
      .update({ approval_flow: data.flow })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "approval_flow_updated",
      details: { ...data.flow },
    });
    return { ok: true };
  });

export const managerApproveContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contract_id: string }) =>
    z.object({ contract_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Manager approval is a management action; dept managers included.
    let allowed = false;
    for (const role of ["hr_admin", "owner", "admin", "dept_manager"] as const) {
      const { data: ok } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: role,
      });
      if (ok === true) {
        allowed = true;
        break;
      }
    }
    if (!allowed) throw new Error("غير مصرح لك باعتماد العقود");

    const { error } = await context.supabase
      .from("contracts")
      .update({ manager_approved_at: new Date().toISOString(), manager_approved_by: context.userId })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "manager_approved",
      details: {},
    });
    return { ok: true };
  });

// ---------- Addenda / later amendments ----------

export const createAddendum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { parent_contract_id: string; title: string; clauses: ClauseRow[]; body: string }) =>
    z
      .object({
        parent_contract_id: z.string().uuid(),
        title: z.string().min(3).max(200),
        clauses: z.array(clauseSchema).max(100),
        body: z.string().min(1).max(200000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContractManager(context as unknown as Ctx);

    const { data: parent, error: pErr } = await context.supabase
      .from("contracts")
      .select("id, employee_id, template_id, data, approval_flow, status")
      .eq("id", data.parent_contract_id)
      .maybeSingle();
    if (pErr) throw mapDbError(pErr);
    if (!parent) throw new Error("العقد الأصلي غير موجود");
    if (parent.status !== "signed") {
      throw new Error("الملاحق تُنشأ فقط على عقد موقّع");
    }

    const { data: created, error } = await context.supabase
      .from("contracts")
      .insert({
        employee_id: parent.employee_id,
        template_id: parent.template_id,
        parent_contract_id: parent.id,
        kind: "addendum",
        title: data.title,
        body: data.body,
        clauses: data.clauses,
        data: parent.data ?? {},
        approval_flow: (parent.approval_flow ?? DEFAULT_APPROVAL_FLOW) as unknown as Record<string, boolean>,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert([
      {
        contract_id: created.id,
        actor_id: context.userId,
        event: "created",
        details: { kind: "addendum", parent_contract_id: parent.id },
      },
      {
        contract_id: parent.id,
        actor_id: context.userId,
        event: "addendum_created",
        details: { addendum_id: created.id, title: data.title },
      },
    ]);

    return { id: created.id as string };
  });
