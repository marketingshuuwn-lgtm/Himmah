import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

// ---------------- Schemas ----------------
export const attendanceRowSchema = z.object({
  employee_no: z.string().min(1).max(40),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ YYYY-MM-DD"),
  check_in_at: z.string().optional().nullable(),
  check_out_at: z.string().optional().nullable(),
  status: z.enum(["present", "late", "absent", "on_leave"]).optional().default("present"),
  late_minutes: z.coerce.number().int().min(0).max(1440).optional().default(0),
  notes: z.string().max(500).optional().nullable(),
});
export type AttendanceRow = z.infer<typeof attendanceRowSchema>;

export const employeeRowSchema = z.object({
  employee_no: z.string().min(1).max(40),
  full_name: z.string().min(1).max(160),
  email: z.string().email().optional().nullable(),
  position: z.string().max(120).optional().default(""),
  department_name: z.string().max(120).optional().nullable(),
  hire_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .default(new Date().toISOString().slice(0, 10)),
  base_salary: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  allowances: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  status: z.enum(["active", "on_leave", "terminated"]).optional().default("active"),
});
export type EmployeeRow = z.infer<typeof employeeRowSchema>;

// ---------------- Helpers ----------------
async function isHR(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" });
  return Boolean(data);
}
async function isMgr(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "dept_manager" });
  return Boolean(data);
}

// ---------------- Create batch ----------------
const createInput = z.object({
  kind: z.enum(["attendance", "employees"]),
  filename: z.string().max(200).optional().nullable(),
  rows: z.array(z.record(z.string(), z.any())).min(1).max(2000),
});

export const createImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hr = await isHR(supabase, userId);
    const mgr = await isMgr(supabase, userId);

    if (data.kind === "employees" && !hr) {
      throw new Error("استيراد بيانات الموظفين متاح للموارد البشرية فقط");
    }

    // Validate rows
    const schema = data.kind === "attendance" ? attendanceRowSchema : employeeRowSchema;
    const parsed: any[] = [];
    const errors: { row: number; error: string }[] = [];
    data.rows.forEach((r, i) => {
      const res = schema.safeParse(r);
      if (res.success) parsed.push(res.data);
      else
        errors.push({
          row: i + 2,
          error: res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
        });
    });

    // Determine scope + department
    let scope: "self" | "department" | "all" = "self";
    let department_id: string | null = null;
    let employee_id: string | null = null;

    if (hr) {
      scope = "all";
    } else if (mgr) {
      scope = "department";
      const { data: dept } = await supabase.rpc("manager_department_id", { _user_id: userId });
      department_id = (dept as string | null) ?? null;
    } else {
      // employee
      scope = "self";
      const { data: emp } = await supabase
        .from("employees")
        .select("id, department_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!emp) throw new Error("لا يوجد سجل موظف مرتبط");
      employee_id = (emp as any).id;
      department_id = (emp as any).department_id;
      if (data.kind === "attendance") {
        // For self imports enforce employee_no in every row matches self
        const { data: self } = await supabase
          .from("employees")
          .select("employee_no")
          .eq("user_id", userId)
          .maybeSingle();
        const myNo = (self as any)?.employee_no;
        const bad = parsed.filter((r) => r.employee_no !== myNo);
        if (bad.length) {
          throw new Error(`الموظف يمكنه استيراد سجلاته فقط (${bad.length} صف بموظف مختلف)`);
        }
      }
    }

    const initialStatus = hr || mgr ? "approved" : "pending";

    const { data: inserted, error } = await supabase
      .from("import_batches")
      .insert({
        kind: data.kind,
        scope,
        submitted_by: userId,
        department_id,
        employee_id,
        status: initialStatus,
        rows_json: parsed,
        errors_json: errors,
        total_count: parsed.length,
        filename: data.filename ?? null,
      })
      .select("id")
      .single();
    if (error) throw mapDbError(error);

    // Auto-apply manager/HR imports immediately
    if (initialStatus === "approved") {
      await applyBatchInternal(supabase, (inserted as any).id, userId);
    }

    return {
      id: (inserted as any).id,
      valid: parsed.length,
      errors: errors.length,
      autoApplied: initialStatus === "approved",
    };
  });

// ---------------- List ----------------
export const listImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("import_batches")
      .select(
        "id, kind, scope, status, submitted_by, department_id, applied_count, total_count, filename, review_note, reviewer_id, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw mapDbError(error);

    // Resolve submitter names
    const submitters = Array.from(new Set((data ?? []).map((b: any) => b.submitted_by)));
    const { data: profiles } = submitters.length
      ? await supabase.from("profiles").select("id, full_name").in("id", submitters)
      : { data: [] as any[] };
    const nm = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    return (data ?? []).map((b: any) => ({ ...b, submitter_name: nm.get(b.submitted_by) ?? "—" }));
  });

// ---------------- Get one ----------------
export const getImportBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: b, error } = await supabase
      .from("import_batches")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!b) throw new Error("الدفعة غير موجودة");
    return b;
  });

// ---------------- Review ----------------
const reviewInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().nullable(),
});

export const reviewImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hr = await isHR(supabase, userId);
    const mgr = await isMgr(supabase, userId);
    if (!hr && !mgr) throw new Error("صلاحية المراجعة مطلوبة");

    const { data: batch, error: eb } = await supabase
      .from("import_batches")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (eb) throw mapDbError(eb);
    if (!batch) throw new Error("الدفعة غير موجودة");
    if ((batch as any).status !== "pending") throw new Error("تمت مراجعة هذه الدفعة مسبقاً");

    if (data.action === "reject") {
      const { error } = await supabase
        .from("import_batches")
        .update({
          status: "rejected",
          reviewer_id: userId,
          reviewed_at: new Date().toISOString(),
          review_note: data.note ?? null,
        })
        .eq("id", data.id);
      if (error) throw mapDbError(error);
      return { ok: true, applied: 0 };
    }

    // Approve → apply
    const applied = await applyBatchInternal(supabase, data.id, userId, data.note ?? null);
    return { ok: true, applied };
  });

// ---------------- Apply logic ----------------
async function applyBatchInternal(
  supabase: any,
  batchId: string,
  reviewerId: string,
  note: string | null = null,
): Promise<number> {
  const { data: b } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (!b) throw new Error("Batch not found");

  const rows: any[] = b.rows_json ?? [];
  let applied = 0;

  if (b.kind === "attendance") {
    // Resolve employee_no → employee_id
    const nos = Array.from(new Set(rows.map((r) => r.employee_no)));
    const { data: emps } = await supabase
      .from("employees")
      .select("id, employee_no")
      .in("employee_no", nos);
    const map = new Map((emps ?? []).map((e: any) => [e.employee_no, e.id]));
    const payload = rows
      .map((r) => {
        const empId = map.get(r.employee_no);
        if (!empId) return null;
        return {
          employee_id: empId,
          work_date: r.work_date,
          check_in_at: r.check_in_at
            ? new Date(`${r.work_date}T${r.check_in_at}`).toISOString()
            : null,
          check_out_at: r.check_out_at
            ? new Date(`${r.work_date}T${r.check_out_at}`).toISOString()
            : null,
          status: r.status ?? "present",
          late_minutes: r.late_minutes ?? 0,
          notes: r.notes ?? null,
          verification_method: "manual" as const,
          manually_edited: true,
        };
      })
      .filter(Boolean) as any[];

    if (payload.length) {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(payload, { onConflict: "employee_id,work_date" });
      if (!error) applied = payload.length;
    }
  } else if (b.kind === "employees") {
    // Only HR reaches here; use admin to create auth users if needed
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const r of rows) {
      // find or create user
      let userId: string | null = null;
      if (r.email) {
        const { findAuthUserByEmail } = await import("@/lib/auth/admin-users.server");
        const found = await findAuthUserByEmail(supabaseAdmin, r.email);
        if (found) userId = found.id;
        else {
          const { data: created } = await supabaseAdmin.auth.admin.createUser({
            email: r.email,
            email_confirm: true,
            user_metadata: { full_name: r.full_name },
          });
          userId = created?.user?.id ?? null;
        }
      }
      if (!userId) continue;

      let dept_id: string | null = null;
      if (r.department_name) {
        const { data: d } = await supabase
          .from("departments")
          .select("id")
          .eq("name", r.department_name)
          .maybeSingle();
        dept_id = (d as any)?.id ?? null;
      }

      const { error } = await supabase.from("employees").upsert(
        {
          user_id: userId,
          employee_no: r.employee_no,
          position: r.position ?? "",
          department_id: dept_id,
          base_salary: r.base_salary ?? 0,
          allowances: r.allowances ?? 0,
          hire_date: r.hire_date,
          status: r.status ?? "active",
        },
        { onConflict: "employee_no" },
      );
      if (!error) applied += 1;
    }
  }

  await supabase
    .from("import_batches")
    .update({
      status: applied === rows.length ? "applied" : "partial",
      applied_count: applied,
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", batchId);
  return applied;
}
