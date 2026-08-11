import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseVariableSpecs,
  serializeVariableSpecs,
  fieldLabel,
  fieldProfileColumn,
  type FieldSource,
} from "@/lib/hr/contract-fields";

// ---------- Types ----------
export type Jurisdiction = "global" | "mena" | "gcc" | "ksa";
export type TemplateDepartment =
  | "tech"
  | "marketing"
  | "consulting_finance"
  | "consulting_admin"
  | "consulting_legal"
  | "hr"
  | "general";
export type ContractType =
  | "employment"
  | "nda_unilateral"
  | "nda_mutual"
  | "consulting"
  | "salary_amendment"
  | "termination";
export type TemplateLanguage = "ar" | "en" | "bilingual";

export interface ContractTemplateRow {
  id: string;
  name: string;
  description: string | null;
  body: string;
  variables: string[];
  /** Per-template override of who fills each variable. */
  variable_sources: Record<string, FieldSource>;
  is_active: boolean;
  created_at: string;
  jurisdiction: Jurisdiction;
  department: TemplateDepartment;
  contract_type: ContractType;
  language: TemplateLanguage;
  tags: string[];
}

export interface ContractRow {
  id: string;
  title: string;
  body: string;
  status: "draft" | "sent" | "signed" | "cancelled";
  employee_id: string;
  employee_name: string;
  template_name: string | null;
  sent_at: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  created_at: string;
  effective_date: string | null;
  employee_note: string | null;
  employee_note_at: string | null;
  data: Record<string, string>;
  /** Variable names still awaiting the employee's own input. */
  pending_employee_fields: string[];
}

export interface AuditEntry {
  id: string;
  event: string;
  details: Record<string, string | number | boolean | null>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_name: string | null;
}

// ---------- Templates ----------
export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractTemplateRow[]> => {
    const { data, error } = await context.supabase
      .from("contract_templates")
      .select(
        "id, name, description, body, variables, is_active, created_at, jurisdiction, department, contract_type, language, tags",
      )
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    return (data ?? []).map((t: any) => {
      const { names, sources } = parseVariableSpecs(t.variables);
      return {
        ...t,
        variables: names,
        variable_sources: sources,
        tags: (t.tags as string[] | null) ?? [],
      };
    }) as ContractTemplateRow[];
  });

const templateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(500).default(""),
  body: z.string().min(10),
  variables: z.array(z.string().min(1).max(60)).max(40).default([]),
  variable_sources: z
    .record(z.string(), z.enum(["profile", "hr", "employee", "system"]))
    .default({}),
  is_active: z.boolean().default(true),
  jurisdiction: z.enum(["global", "mena", "gcc", "ksa"]).default("ksa"),
  department: z
    .enum([
      "tech",
      "marketing",
      "consulting_finance",
      "consulting_admin",
      "consulting_legal",
      "hr",
      "general",
    ])
    .default("general"),
  contract_type: z
    .enum([
      "employment",
      "nda_unilateral",
      "nda_mutual",
      "consulting",
      "salary_amendment",
      "termination",
    ])
    .default("employment"),
  language: z.enum(["ar", "en", "bilingual"]).default("ar"),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
});

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => templateInput.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      description: data.description,
      body: data.body,
      variables: serializeVariableSpecs(data.variables, data.variable_sources),
      is_active: data.is_active,
      jurisdiction: data.jurisdiction,
      department: data.department,
      contract_type: data.contract_type,
      language: data.language,
      tags: data.tags,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("contract_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("contract_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw mapDbError(error);
    return { id: inserted.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contract_templates").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

// ---------- Contracts ----------
async function loadEmployeeNames(supabase: any, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data: emps } = await supabase.from("employees").select("id, user_id").in("id", ids);
  const uids = Array.from(new Set((emps ?? []).map((e: any) => e.user_id)));
  const { data: profiles } = uids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", uids)
    : { data: [] };
  const pm = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
  return new Map<string, string>(
    (emps ?? []).map((e: any) => [e.id, (pm.get(e.user_id) as string) || "—"]),
  );
}

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractRow[]> => {
    const { data, error } = await context.supabase
      .from("contracts")
      .select(
        "id, title, body, status, employee_id, sent_at, signed_at, pdf_url, created_at, effective_date, employee_note, employee_note_at, data, template_id, pending_employee_fields",
      )
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((data ?? []).map((c) => c.employee_id)));
    const tplIds = Array.from(
      new Set((data ?? []).map((c) => c.template_id).filter(Boolean) as string[]),
    );
    const [names, { data: tpls }] = await Promise.all([
      loadEmployeeNames(context.supabase, empIds),
      tplIds.length
        ? context.supabase.from("contract_templates").select("id, name").in("id", tplIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const tplMap = new Map((tpls ?? []).map((t: any) => [t.id, t.name as string]));

    return (data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      status: c.status as ContractRow["status"],
      employee_id: c.employee_id,
      employee_name: names.get(c.employee_id) || "—",
      template_name: c.template_id ? (tplMap.get(c.template_id) ?? null) : null,
      sent_at: c.sent_at,
      signed_at: c.signed_at,
      pdf_url: c.pdf_url,
      created_at: c.created_at,
      effective_date: c.effective_date ?? null,
      employee_note: c.employee_note ?? null,
      employee_note_at: c.employee_note_at ?? null,
      data: (c.data as Record<string, string>) ?? {},
      pending_employee_fields: ((c as any).pending_employee_fields as string[] | null) ?? [],
    }));
  });

export const myContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractRow[]> => {
    const { data: emp } = await context.supabase
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!emp) return [];
    const { data, error } = await context.supabase
      .from("contracts")
      .select(
        "id, title, body, status, employee_id, sent_at, signed_at, pdf_url, created_at, effective_date, employee_note, employee_note_at, data, template_id, pending_employee_fields",
      )
      .eq("employee_id", emp.id)
      .in("status", ["sent", "signed"])
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    const names = await loadEmployeeNames(context.supabase, [emp.id]);
    return (data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      status: c.status as ContractRow["status"],
      employee_id: c.employee_id,
      employee_name: names.get(c.employee_id) || "—",
      template_name: null,
      sent_at: c.sent_at,
      signed_at: c.signed_at,
      pdf_url: c.pdf_url,
      created_at: c.created_at,
      effective_date: c.effective_date ?? null,
      employee_note: c.employee_note ?? null,
      employee_note_at: c.employee_note_at ?? null,
      data: (c.data as Record<string, string>) ?? {},
      pending_employee_fields: ((c as any).pending_employee_fields as string[] | null) ?? [],
    }));
  });

const createContractInput = z.object({
  template_id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  title: z.string().min(2).max(160),
  body: z.string().min(10),
  data: z.record(z.string(), z.string()).default({}),
  salary: z.number().min(0).max(10_000_000).optional().nullable(),
  allowances: z.number().min(0).max(10_000_000).optional().nullable(),
  effective_date: z.string().min(10).optional().nullable(),
  /** Variables intentionally left for the employee to complete. */
  pending_employee_fields: z.array(z.string().min(1).max(60)).max(40).default([]),
});

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createContractInput.parse(d))
  .handler(async ({ data, context }) => {
    const body = renderTemplate(data.body, data.data);
    const { data: inserted, error } = await context.supabase
      .from("contracts")
      .insert({
        template_id: data.template_id ?? null,
        employee_id: data.employee_id,
        title: data.title,
        body,
        data: data.data,
        salary: data.salary ?? null,
        allowances: data.allowances ?? null,
        effective_date: data.effective_date ?? null,
        pending_employee_fields: data.pending_employee_fields,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: inserted.id,
      actor_id: context.userId,
      event: "created",
      details: { title: data.title },
    });

    return { id: inserted.id };
  });

async function assertHR(supabase: any, userId: string) {
  const { data: isHR } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "hr_admin",
  });
  if (!isHR) throw new Error("غير مصرح: يتطلب صلاحية HR");
}

export const sendContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHR(context.supabase, context.userId);

    // Completeness gate. Administration-owned placeholders must all be
    // filled before a contract leaves HR; placeholders explicitly delegated
    // to the employee are allowed through and requested from them instead.
    const { data: draft, error: draftErr } = await context.supabase
      .from("contracts")
      .select("body, pending_employee_fields")
      .eq("id", data.id)
      .maybeSingle();
    if (draftErr) throw mapDbError(draftErr);
    if (!draft) throw new Error("العقد غير موجود");
    const { unfilledPlaceholders, contractIncompleteMessage } = await import(
      "@/lib/hr/contract-autofill"
    );
    const pending = (((draft as any).pending_employee_fields as string[] | null) ?? []).map(String);
    const missing = unfilledPlaceholders(draft.body ?? "", {}).filter(
      (k) => !pending.includes(k),
    );
    if (missing.length) throw new Error(contractIncompleteMessage(missing));
    const awaitingEmployee = unfilledPlaceholders(draft.body ?? "", {}).filter((k) =>
      pending.includes(k),
    );

    const { data: contract, error } = await context.supabase
      .from("contracts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        pending_employee_fields: awaitingEmployee,
      })
      .eq("id", data.id)
      .select("id, title, employee_id, employees(user_id)")
      .maybeSingle();
    if (error) throw mapDbError(error);
    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.id,
      actor_id: context.userId,
      event: "sent",
      details: { awaiting_employee_fields: awaitingEmployee.length },
    });

    // The employee must never have to notice a new contract on their own —
    // this was previously missing entirely.
    const employeeUserId = (contract as { employees?: { user_id?: string } } | null)?.employees
      ?.user_id;
    if (employeeUserId) {
      await context.supabase.from("notifications").insert({
        user_id: employeeUserId,
        kind: "warning",
        title: awaitingEmployee.length ? "عقد بانتظار بياناتك" : "عقد بحاجة إلى توقيعك",
        body: awaitingEmployee.length
          ? `«${contract?.title ?? "عقد"}» يحتاج تعبئة ${awaitingEmployee.length} من بياناتك (${awaitingEmployee
              .map(fieldLabel)
              .join("، ")}) قبل التوقيع.`
          : `«${contract?.title ?? "عقد"}» بانتظار توقيعك — يرجى المراجعة والتوقيع.`,
        link: "/contracts",
      });
    }

    return { ok: true };
  });

// ---------- Employee-supplied contract data ----------
const employeeFieldsInput = z.object({
  contract_id: z.string().uuid(),
  values: z.record(z.string().min(1).max(60), z.string().trim().min(1).max(500)),
});

/**
 * The employee fills the placeholders that only they can answer (address,
 * emergency contact…). Values are written into the contract body once, and
 * the transferable ones are copied into their employee record so no future
 * contract ever asks for them again.
 */
export const submitEmployeeContractFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employeeFieldsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: emp } = await supabase
      .from("employees")
      .select("id, national_id, iban, bank_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("ليس لديك ملف موظف");

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select("id, body, data, status, employee_id, pending_employee_fields")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (cErr) throw mapDbError(cErr);
    if (!contract || contract.employee_id !== emp.id)
      throw new Error("العقد غير موجود أو لا يخصّك");
    if (contract.status !== "sent") throw new Error("لا يمكن تعديل بيانات هذا العقد");

    const pending = (((contract as any).pending_employee_fields as string[] | null) ?? []).map(
      String,
    );
    // Only fields explicitly delegated to the employee may be written.
    const accepted: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.values)) {
      if (pending.includes(k)) accepted[k] = v.trim();
    }
    if (!Object.keys(accepted).length) throw new Error("لا توجد حقول مطلوبة منك في هذا العقد");

    const nextBody = renderTemplate(contract.body ?? "", accepted);
    const nextData = { ...((contract.data as Record<string, string>) ?? {}), ...accepted };
    const stillPending = pending.filter((k) => !accepted[k]);

    const { error: updErr } = await supabase
      .from("contracts")
      .update({ body: nextBody, data: nextData, pending_employee_fields: stillPending })
      .eq("id", contract.id);
    if (updErr) throw mapDbError(updErr);

    await supabase.from("contract_audit_log").insert({
      contract_id: contract.id,
      actor_id: userId,
      event: "employee_fields_submitted",
      details: { fields: Object.keys(accepted).map(fieldLabel).join("، ") },
      ip_address: getRequestIP({ xForwardedFor: false }) ?? null,
      user_agent: getRequestHeader("user-agent") ?? null,
    });

    // Write-back so the data becomes part of the single employee record.
    const profilePatch: Partial<{ national_id: string; iban: string; bank_name: string }> = {};
    for (const [k, v] of Object.entries(accepted)) {
      const col = fieldProfileColumn(k);
      if (col && !(emp as any)[col]) profilePatch[col] = v;
    }
    if (Object.keys(profilePatch).length) {
      await supabase.from("employees").update(profilePatch).eq("id", emp.id);
    }

    return { ok: true, remaining: stillPending.length };
  });



export const cancelContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHR(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw mapDbError(error);
    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.id,
      actor_id: context.userId,
      event: "cancelled",
      details: {},
    });
    return { ok: true };
  });

// ---------- Sign ----------
const signInput = z.object({
  contract_id: z.string().uuid(),
  signature_image: z
    .string()
    .min(50)
    .max(524_288)
    .regex(/^data:image\/(png|jpe?g|svg\+xml);base64,/, "توقيع غير صالح"),
  webauthn_response: z.any().optional().nullable(),
});

export const signContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => signInput.parse(d))
  .handler(async ({ data, context }) => {
    // verify contract belongs to this user and is "sent"
    const { data: emp } = await context.supabase
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!emp) throw new Error("ليس لديك ملف موظف");

    const { data: contract } = await context.supabase
      .from("contracts")
      .select(
        "id, status, employee_id, template_id, salary, allowances, effective_date, body, approval_flow, manager_approved_at",
      )
      .eq("id", data.contract_id)
      .maybeSingle();
    if (!contract || contract.employee_id !== emp.id) throw new Error("هذا العقد لا يخصك");
    if (contract.status !== "sent") throw new Error("لا يمكن توقيع هذا العقد");

    // Flexible approval path: only the steps HR enabled on this contract are enforced.
    const { normalizeFlow } = await import("@/lib/hr/contract-flex.functions");
    const flow = normalizeFlow((contract as { approval_flow?: unknown }).approval_flow);
    if (flow.require_manager_approval && !contract.manager_approved_at) {
      throw new Error("هذا العقد يتطلب اعتماد المدير قبل التوقيع");
    }


    // Server-side completeness gate — mirrors the HR send gate so a
    // partially-filled contract can never end up signed even if it
    // slipped past on the way out.
    {
      const { unfilledPlaceholders, contractIncompleteMessage } = await import(
        "@/lib/hr/contract-autofill"
      );
      const missing = unfilledPlaceholders((contract as { body?: string }).body ?? "", {});
      if (missing.length) throw new Error(contractIncompleteMessage(missing));
    }

    // If the client presented a WebAuthn assertion, verify it server-side
    // (consumes an active challenge from webauthn_challenges). The verified
    // flag is derived from that result — never trusted from client input.
    let webauthn_verified = false;
    let webauthn_credential_id: string | null = null;
    if (data.webauthn_response) {
      const { verifyAndConsumeAuthAssertion } = await import("@/lib/hr/webauthn.server");
      const res = await verifyAndConsumeAuthAssertion(
        context.supabase,
        context.userId,
        data.webauthn_response,
      );
      webauthn_verified = true;
      webauthn_credential_id = res.credential_id;
    }
    if (flow.require_biometric && !webauthn_verified) {
      throw new Error("هذا العقد يتطلب التحقق بالبصمة قبل التوقيع");
    }


    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const { error: sigErr } = await context.supabase.from("signatures").insert({
      contract_id: data.contract_id,
      signer_id: context.userId,
      signature_image: data.signature_image,
      webauthn_verified,
      webauthn_credential_id,
      ip_address: ip,
      user_agent: ua,
    });
    if (sigErr) throw mapDbError(sigErr);

    const { error: upErr } = await context.supabase
      .from("contracts")
      .update({ status: "signed", signed_at: new Date().toISOString() })
      .eq("id", data.contract_id);
    if (upErr) throw mapDbError(upErr);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "signed",
      ip_address: ip,
      user_agent: ua,
      details: { webauthn: webauthn_verified },
    });

    // Single source of truth: a signed employment / salary_amendment
    // contract with a structured salary drives the operational salary.
    // Applied via the service role (the signing employee cannot update
    // employees under RLS); locked payroll months remain frozen by design.
    //
    // Extensible by design: as more contract fields get structured columns
    // in the future (position, department, etc.), add them to this same
    // update() call — one place drives everything the contract is allowed
    // to write back to the employee record. Each new signed contract
    // re-applies its own values, so a later contract naturally supersedes
    // an earlier one without any special "re-link" step.
    let templateType: string | null = null;
    if (contract.template_id) {
      const { data: tpl } = await context.supabase
        .from("contract_templates")
        .select("contract_type")
        .eq("id", contract.template_id)
        .maybeSingle();
      templateType = tpl?.contract_type ?? null;
    }
    const isEmploymentContract = templateType === null || templateType === "employment";
    const salaryDriving = isEmploymentContract || templateType === "salary_amendment";
    const effectiveReached =
      !contract.effective_date || contract.effective_date <= new Date().toISOString().slice(0, 10);

    if (
      (contract.salary != null && salaryDriving) ||
      (isEmploymentContract && contract.effective_date)
    ) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const patch: { base_salary?: number; allowances?: number; hire_date?: string } = {};
      if (contract.salary != null && salaryDriving && effectiveReached) {
        patch.base_salary = Number(contract.salary);
        if (contract.allowances != null) patch.allowances = Number(contract.allowances);
      }
      // An employment contract's effective date IS the employee's start
      // date — keep hire_date in sync so the profile never disagrees with
      // the signed contract.
      if (isEmploymentContract && contract.effective_date) {
        patch.hire_date = contract.effective_date;
      }
      if (Object.keys(patch).length) {
        const { error: salErr } = await supabaseAdmin
          .from("employees")
          .update(patch)
          .eq("id", contract.employee_id);
        if (salErr) {
          console.error("[signContract] employee sync failed", salErr);
        } else {
          await supabaseAdmin.from("security_audit_log").insert({
            entity_type: "employee",
            entity_id: contract.employee_id,
            action: "synced_from_contract",
            actor_user_id: context.userId,
            actor_kind: "user",
            metadata: { contract_id: contract.id, ...patch },
          });
        }
      }
    }

    // Notify HR the moment the employee accepts — previously silent.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: hrRoles }, { data: empRow }] = await Promise.all([
        context.supabase.from("user_roles").select("user_id").eq("role", "hr_admin"),
        context.supabase
          .from("employees")
          .select("user_id")
          .eq("id", contract.employee_id)
          .maybeSingle(),
      ]);
      const empName = empRow?.user_id
        ? (
            await context.supabase
              .from("profiles")
              .select("full_name")
              .eq("id", empRow.user_id)
              .maybeSingle()
          ).data?.full_name
        : null;
      const recipients = Array.from(new Set((hrRoles ?? []).map((r) => r.user_id)));
      if (recipients.length) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            kind: "success" as const,
            title: "تم توقيع العقد",
            body: `وقّع ${empName ?? "الموظف"} على العقد بنجاح.`,
            link: `/contracts`,
          })),
        );
      }
    } catch (e) {
      console.error("[signContract] HR notification failed", e);
    }

    return { ok: true };
  });

const contractNoteInput = z.object({
  contract_id: z.string().uuid(),
  note: z.string().trim().min(1).max(1000),
});

/**
 * Lets the employee attach a note/objection to a sent contract — e.g. a
 * discrepancy in the stated salary — without needing to sign or reject
 * outright. Surfaced prominently to HR (badge + banner) so it can be
 * corrected and re-sent.
 */
export const addContractNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contractNoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!emp) throw new Error("ليس لديك ملف موظف");

    const { data: contract } = await context.supabase
      .from("contracts")
      .select("id, employee_id, title, status")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (!contract || contract.employee_id !== emp.id) throw new Error("هذا العقد لا يخصك");
    if (contract.status === "signed" || contract.status === "cancelled") {
      throw new Error("لا يمكن إضافة ملاحظة على عقد موقّع أو ملغى");
    }

    const { error } = await context.supabase
      .from("contracts")
      .update({ employee_note: data.note, employee_note_at: new Date().toISOString() })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "employee_note",
      details: { note: data.note },
    });

    // Notify HR — this is exactly the kind of thing that must not sit
    // quietly unnoticed.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: hrRoles } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "hr_admin");
      const recipients = Array.from(new Set((hrRoles ?? []).map((r) => r.user_id)));
      if (recipients.length) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            kind: "warning" as const,
            title: "ملاحظة على عقد",
            body: `أضاف الموظف ملاحظة على «${contract.title}» — بحاجة لمراجعتك.`,
            link: "/contracts",
          })),
        );
      }
    } catch (e) {
      console.error("[addContractNote] HR notification failed", e);
    }

    return { ok: true };
  });

export const attachPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contract_id: z.string().uuid(), pdf_url: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHR(context.supabase, context.userId);
    // Restrict pdf_url to Supabase Storage URLs from the "contracts" bucket
    // to prevent HR admins from being tricked into opening phishing links.
    const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
    const allowedPrefixes = supabaseUrl
      ? [
          `${supabaseUrl}/storage/v1/object/sign/contracts/`,
          `${supabaseUrl}/storage/v1/object/authenticated/contracts/`,
          `${supabaseUrl}/storage/v1/object/public/contracts/`,
        ]
      : [];
    if (!allowedPrefixes.some((p) => data.pdf_url.startsWith(p))) {
      throw new Error("رابط PDF غير مسموح: يجب أن يكون من تخزين النظام");
    }
    const { error } = await context.supabase
      .from("contracts")
      .update({ pdf_url: data.pdf_url })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const getContractAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contract_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AuditEntry[]> => {
    const { data: rows, error } = await context.supabase
      .from("contract_audit_log")
      .select("id, event, details, ip_address, user_agent, created_at, actor_id")
      .eq("contract_id", data.contract_id)
      .order("created_at", { ascending: true });
    if (error) throw mapDbError(error);
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[]),
    );
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string }[] };
    const pm = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      event: r.event,
      details: (r.details as Record<string, string | number | boolean | null>) ?? {},
      ip_address: r.ip_address,
      user_agent: r.user_agent,
      created_at: r.created_at,
      actor_name: r.actor_id ? (pm.get(r.actor_id) ?? null) : null,
    }));
  });

/**
 * Fetches the contract row alongside its full audit trail — used by the
 * dedicated per-contract audit page so we hit the server once instead of
 * chaining two round-trips. Authorization is enforced by RLS on both
 * `contracts` and `contract_audit_log`.
 */
export const getContractWithAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contract_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("contracts")
      .select("id, title, status, employee_id, created_at, sent_at, signed_at, effective_date")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!c) throw new Error("العقد غير موجود");
    const names = await loadEmployeeNames(context.supabase, [c.employee_id]);
    const { data: rows } = await context.supabase
      .from("contract_audit_log")
      .select("id, event, details, ip_address, user_agent, created_at, actor_id")
      .eq("contract_id", data.contract_id)
      .order("created_at", { ascending: true });
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean) as string[]),
    );
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as { id: string; full_name: string }[] };
    const pm = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return {
      contract: {
        id: c.id,
        title: c.title,
        status: c.status as ContractRow["status"],
        employee_name: names.get(c.employee_id) || "—",
        created_at: c.created_at,
        sent_at: c.sent_at,
        signed_at: c.signed_at,
        effective_date: c.effective_date ?? null,
      },
      audit: (rows ?? []).map((r) => ({
        id: r.id,
        event: r.event,
        details: (r.details as Record<string, string | number | boolean | null>) ?? {},
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        created_at: r.created_at,
        actor_name: r.actor_id ? (pm.get(r.actor_id) ?? null) : null,
      })) as AuditEntry[],
    };
  });

/**
 * Lightweight audit trail hook used by the UI to record non-mutating
 * lifecycle events (preview, view, open sign link, open PDF) so the
 * timeline reflects every real touchpoint — not just state changes.
 */
const uiEvent = z.enum(["previewed", "viewed", "sign_link_opened", "pdf_opened"]);
export const recordContractEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contract_id: z.string().uuid(),
        event: uiEvent,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const { error } = await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: data.event,
      details: {},
      ip_address: ip,
      user_agent: ua,
    });
    if (error) throw mapDbError(error);
    return { ok: true };
  });

const rejectInput = z.object({
  contract_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});
/**
 * Employee-side rejection of a sent contract. Marks the contract as
 * cancelled, stores the rejection reason as an employee note, and writes
 * an explicit `rejected` audit event so the timeline distinguishes an HR
 * cancel from an employee refusal.
 */
export const rejectContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!emp) throw new Error("ليس لديك ملف موظف");
    const { data: contract } = await context.supabase
      .from("contracts")
      .select("id, employee_id, title, status")
      .eq("id", data.contract_id)
      .maybeSingle();
    if (!contract || contract.employee_id !== emp.id) throw new Error("هذا العقد لا يخصك");
    if (contract.status !== "sent") throw new Error("لا يمكن رفض هذا العقد");

    const { error } = await context.supabase
      .from("contracts")
      .update({
        status: "cancelled",
        employee_note: data.reason,
        employee_note_at: new Date().toISOString(),
      })
      .eq("id", data.contract_id);
    if (error) throw mapDbError(error);

    await context.supabase.from("contract_audit_log").insert({
      contract_id: data.contract_id,
      actor_id: context.userId,
      event: "rejected",
      details: { reason: data.reason },
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: hrRoles } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "hr_admin");
      const recipients = Array.from(new Set((hrRoles ?? []).map((r) => r.user_id)));
      if (recipients.length) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid,
            kind: "warning" as const,
            title: "رفض عقد",
            body: `رفض الموظف «${contract.title}» — السبب: ${data.reason.slice(0, 140)}`,
            link: `/contracts/${contract.id}/audit`,
          })),
        );
      }
    } catch (e) {
      console.error("[rejectContract] HR notification failed", e);
    }

    return { ok: true };
  });
