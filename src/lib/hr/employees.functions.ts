import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmployeeStatus = "active" | "on_leave" | "terminated";

export interface EmployeeRow {
  id: string;
  user_id: string;
  full_name: string;
  employee_no: string | null;
  position: string;
  department_id: string | null;
  department_name: string | null;
  base_salary: number;
  allowances: number;
  hire_date: string;
  status: EmployeeStatus;
  national_id: string | null;
  bank_name: string | null;
  iban: string | null;
  missing_fields: string[];
}

/**
 * Single source of truth for what counts as a "complete" employee record.
 * Used consistently by the employees list (HR-facing badge) and the
 * employee profile page (self + HR-facing banner) so the definition never
 * drifts between the two surfaces.
 */
export function computeMissingFields(e: {
  position?: string | null;
  department_id?: string | null;
  base_salary?: number | null;
  national_id?: string | null;
  bank_name?: string | null;
  iban?: string | null;
}): string[] {
  const missing: string[] = [];
  if (!e.position?.trim()) missing.push("المسمى الوظيفي");
  if (!e.department_id) missing.push("القسم");
  if (!e.base_salary || e.base_salary <= 0) missing.push("الراتب الأساسي");
  if (!e.national_id?.trim()) missing.push("رقم الهوية");
  if (!e.bank_name?.trim()) missing.push("اسم البنك");
  if (!e.iban?.trim()) missing.push("رقم الآيبان (IBAN)");
  return missing;
}

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmployeeRow[]> => {
    const { supabase } = context;
    const { data: emps, error } = await supabase
      .from("employees")
      .select(
        "id, user_id, employee_no, position, department_id, base_salary, allowances, hire_date, status, national_id, bank_name, iban",
      )
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);

    const userIds = Array.from(new Set((emps ?? []).map((e) => e.user_id)));
    const depIds = Array.from(
      new Set((emps ?? []).map((e) => e.department_id).filter(Boolean) as string[]),
    );

    const [{ data: profiles }, { data: deps }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      depIds.length
        ? supabase.from("departments").select("id, name").in("id", depIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));
    const dMap = new Map((deps ?? []).map((d) => [d.id, d.name] as const));

    return (emps ?? []).map((e) => ({
      id: e.id,
      user_id: e.user_id,
      full_name: pMap.get(e.user_id) || "بدون اسم",
      employee_no: e.employee_no,
      position: e.position,
      department_id: e.department_id,
      department_name: e.department_id ? (dMap.get(e.department_id) ?? null) : null,
      base_salary: Number(e.base_salary),
      allowances: Number(e.allowances),
      hire_date: e.hire_date,
      status: e.status as EmployeeStatus,
      national_id: e.national_id,
      bank_name: e.bank_name,
      iban: e.iban,
      missing_fields: computeMissingFields(e),
    }));
  });

export const listAvailableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: profiles }, { data: emps }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("employees").select("user_id"),
    ]);
    const taken = new Set((emps ?? []).map((e) => e.user_id));
    return (profiles ?? [])
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ id: p.id, name: p.full_name || "بدون اسم" }));
  });

/** Accounts that signed up but are not yet linked to an employee record. */
export const listPendingActivations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isHR } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "hr_admin",
    });
    if (!isHR) return [];

    const [{ data: profiles }, { data: emps }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("employees").select("user_id"),
    ]);
    const taken = new Set((emps ?? []).map((e) => e.user_id));
    const pending = (profiles ?? []).filter((p) => !taken.has(p.id));
    if (!pending.length) return [];

    // Emails via paginated admin lookup (best-effort).
    let emailByUser = new Map<string, string | null>();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { listAllAuthUserEmails } = await import("@/lib/auth/admin-users.server");
      emailByUser = await listAllAuthUserEmails(supabaseAdmin);
    } catch {
      // emails stay empty
    }

    return pending.map((p) => ({
      user_id: p.id,
      name: p.full_name || "بدون اسم",
      email: emailByUser.get(p.id) ?? null,
      created_at: p.created_at,
    }));
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  employee_no: z.string().trim().max(20).optional(),
  position: z.string().max(120).default(""),
  department_id: z.string().uuid().optional().nullable(),
  base_salary: z.number().min(0).max(10_000_000),
  allowances: z.number().min(0).max(10_000_000),
  hire_date: z.string().min(1),
  status: z.enum(["active", "on_leave", "terminated"]).default("active"),
  national_id: z.string().trim().max(30).optional().nullable(),
  bank_name: z.string().trim().max(120).optional().nullable(),
  iban: z.string().trim().max(40).optional().nullable(),
});

/**
 * Renumbers EVERY employee that has a department into a clean, contiguous
 * per-department sequence — `CODE-001`, `CODE-002`, … ordered by hire
 * date (then created_at, then id as a stable tie-break). Uses a two-pass
 * assignment (temporary tag → final code) so the unique `employee_no`
 * constraint can't collide mid-rewrite. Employees with no department are
 * left untouched. hr_admin only; fully audited (before/after snapshot).
 */
export const resequenceEmployeeNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isHR } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "hr_admin",
    });
    if (!isHR) throw new Error("Forbidden: hr_admin role required");

    const { data: emps, error } = await supabase
      .from("employees")
      .select("id, employee_no, hire_date, created_at, department_id")
      .order("hire_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw mapDbError(error);
    if (!emps?.length) return { renumbered: 0 };

    const depIds = Array.from(
      new Set(emps.map((e) => e.department_id).filter(Boolean) as string[]),
    );
    const { data: deps } = depIds.length
      ? await supabase.from("departments").select("id, code").in("id", depIds)
      : { data: [] as { id: string; code: string | null }[] };
    const codeByDept = new Map(
      (deps ?? []).map((d) => [d.id, (d.code ?? "").trim().toUpperCase()] as const),
    );

    // Only renumber employees whose department has a real code — this
    // guarantees "CODE-###" format with no orphan gaps.
    const targets = emps.filter(
      (e) => e.department_id && (codeByDept.get(e.department_id) ?? "") !== "",
    );
    if (!targets.length) return { renumbered: 0 };

    const before = targets.map((e) => ({ id: e.id, employee_no: e.employee_no }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pass 1: park everyone under a unique temporary tag so the final
    // codes can be written without ever conflicting with the current
    // values of a sibling row.
    for (const e of targets) {
      const { error: tmpErr } = await supabaseAdmin
        .from("employees")
        .update({ employee_no: `TMP-${e.id}` })
        .eq("id", e.id);
      if (tmpErr) throw mapDbError(tmpErr);
    }

    // Pass 2: emit contiguous per-department numbers.
    const counters = new Map<string, number>();
    const after: { id: string; employee_no: string }[] = [];
    for (const e of targets) {
      const code = codeByDept.get(e.department_id!)!;
      const next = (counters.get(code) ?? 0) + 1;
      counters.set(code, next);
      const finalNo = `${code}-${String(next).padStart(3, "0")}`;
      const { error: upErr } = await supabaseAdmin
        .from("employees")
        .update({ employee_no: finalNo })
        .eq("id", e.id);
      if (upErr) throw mapDbError(upErr);
      after.push({ id: e.id, employee_no: finalNo });
    }

    await supabase.from("security_audit_log").insert({
      entity_type: "employee",
      entity_id: null,
      action: "resequence_employee_numbers",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: {
        count: targets.length,
        per_department: Object.fromEntries(counters),
        before,
        after,
      },
    });

    return { renumbered: targets.length };
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: data.user_id,
      position: data.position,
      department_id: data.department_id || null,
      base_salary: data.base_salary,
      allowances: data.allowances,
      hire_date: data.hire_date,
      status: data.status,
      national_id: data.national_id || null,
      bank_name: data.bank_name || null,
      iban: data.iban || null,
      // Single source of truth for numbering: the DB sequence auto-assigns
      // when omitted; an explicit value (e.g. legacy import) is respected.
      ...(data.employee_no ? { employee_no: data.employee_no } : {}),
    };
    if (data.id) {
      const { error } = await context.supabase.from("employees").update(payload).eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("employees")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw mapDbError(error);

    // Welcome the activated employee: in-app notification with their
    // department, sent via the service role (cross-user notification).
    try {
      let deptName: string | null = null;
      if (data.department_id) {
        const { data: d } = await context.supabase
          .from("departments")
          .select("name")
          .eq("id", data.department_id)
          .maybeSingle();
        deptName = d?.name ?? null;
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert({
        user_id: data.user_id,
        kind: "success",
        title: "تم تفعيل حسابك",
        body: deptName
          ? `رُبط حسابك بقسم «${deptName}» — أهلاً بك، يمكنك الآن تسجيل الحضور ومتابعة صفحتك.`
          : "تم إنشاء ملفك الوظيفي — أهلاً بك، يمكنك الآن تسجيل الحضور ومتابعة صفحتك.",
        link: "/me",
      });

      // Proactively flag incomplete data at the moment of activation,
      // rather than letting it surface only when someone happens to open
      // the profile later.
      const missing = computeMissingFields(data);
      if (missing.length) {
        const { data: hrRoles } = await context.supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "hr_admin");
        const empName = (
          await context.supabase
            .from("profiles")
            .select("full_name")
            .eq("id", data.user_id)
            .maybeSingle()
        ).data?.full_name;
        const recipients = Array.from(new Set((hrRoles ?? []).map((r) => r.user_id)));
        if (recipients.length) {
          await supabaseAdmin.from("notifications").insert(
            recipients.map((uid) => ({
              user_id: uid,
              kind: "warning" as const,
              title: "ملف موظف غير مكتمل",
              body: `ملف ${empName ?? "الموظف الجديد"} يفتقد: ${missing.join("، ")}`,
              link: `/employees/${row.id}`,
            })),
          );
        }
      }
    } catch (e) {
      console.error("[upsertEmployee] activation notification failed", e);
    }

    return { id: row.id };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
