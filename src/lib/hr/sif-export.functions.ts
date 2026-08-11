import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

async function ensureHrOrOwner(supabase: any, userId: string) {
  const [{ data: hr }, { data: owner }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  if (!hr && !owner) throw new Error("Forbidden");
}

/**
 * Export a payroll run as a KSA WPS-compatible SIF text file.
 * Returns { filename, content } — the client saves as .sif.
 */
export const exportPayrollSif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ period_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ context, data }) => {
    await ensureHrOrOwner(context.supabase, context.userId);
    const { supabase } = context;

    const [{ data: org }, { data: runs, error }] = await Promise.all([
      supabase.from("org_settings").select("*").limit(1).maybeSingle(),
      supabase.from("payroll_runs").select("*").eq("period_month", data.period_month),
    ]);
    if (error) throw mapDbError(error);
    if (!runs?.length) throw new Error("لا توجد سجلات رواتب لهذه الفترة");

    const empIds = runs.map((r: any) => r.employee_id);
    const { data: emps } = await supabase
      .from("employees")
      .select("id, user_id, employee_no, national_id, iban, bank_name")
      .in("id", empIds);
    const { data: profs } = await supabase
      .from("profiles").select("id, full_name")
      .in("id", (emps ?? []).map((e: any) => e.user_id));

    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));

    const { buildKsaWpsSif } = await import("@/lib/utils/sif-builder");
    const rows = runs.map((r: any) => {
      const e = empMap.get(r.employee_id) as any;
      const allowances = Number(r.allowances || 0) + Number(r.bonuses_total || 0);
      const deductions = Number(r.deductions_total || 0) + Number(r.absence_deduction || 0) + Number(r.late_deduction || 0);
      return {
        employee_no: e?.employee_no || "",
        full_name: profMap.get(e?.user_id) || "",
        national_id: e?.national_id || "",
        iban: e?.iban || "",
        bank_name: e?.bank_name || "",
        base_salary: Number(r.base_salary || 0),
        allowances,
        deductions,
        net_salary: Number(r.net_salary || 0),
      };
    });

    const content = buildKsaWpsSif({
      org: org ?? { establishment_name: "", employer_id: "", bank_code: "", bank_name: "", iban: "" },
      periodMonth: data.period_month,
      employees: rows,
    });
    const filename = `WPS_${data.period_month.slice(0, 7)}.sif`;
    return { filename, content };
  });

/**
 * CSV export of attendance for a date range. Manager/HR only.
 */
export const exportAttendanceCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      department_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [{ data: hr }, { data: owner }, { data: mgr }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "dept_manager" }),
    ]);
    if (!hr && !owner && !mgr) throw new Error("Forbidden");

    let empQ = supabase.from("employees").select("id, user_id, employee_no, department_id");
    if (!hr && !owner && mgr) {
      const { data: dept } = await supabase.rpc("manager_department_id", { _user_id: userId });
      if (dept) empQ = empQ.eq("department_id", dept as string);
    }
    if (data.department_id) empQ = empQ.eq("department_id", data.department_id);
    const { data: emps } = await empQ;
    const empIds = (emps ?? []).map((e: any) => e.id);
    if (!empIds.length) return { filename: `attendance_${data.from}_${data.to}.csv`, content: "" };

    const { data: profs } = await supabase.from("profiles").select("id, full_name")
      .in("id", (emps ?? []).map((e: any) => e.user_id));
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));

    const { data: att, error } = await supabase.from("attendance_records")
      .select("employee_id, work_date, check_in_at, check_out_at, status, late_minutes")
      .in("employee_id", empIds)
      .gte("work_date", data.from).lte("work_date", data.to)
      .order("work_date");
    if (error) throw mapDbError(error);

    const rows = (att ?? []).map((a: any) => {
      const e = empMap.get(a.employee_id) as any;
      return {
        employee_no: e?.employee_no || "",
        full_name: profMap.get(e?.user_id) || "",
        work_date: a.work_date,
        check_in_at: a.check_in_at || "",
        check_out_at: a.check_out_at || "",
        status: a.status,
        late_minutes: a.late_minutes ?? 0,
      };
    });

    const { buildAttendanceCsv } = await import("@/lib/utils/sif-builder");
    return {
      filename: `attendance_${data.from}_${data.to}.csv`,
      content: buildAttendanceCsv(rows),
    };
  });

// ---------- Org settings CRUD (HR/owner) ----------
export const getOrgSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("org_settings").select("*").limit(1).maybeSingle();
    return data ?? { establishment_name: "", employer_id: "", bank_code: "", bank_name: "", iban: "" };
  });

export const updateOrgSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      establishment_name: z.string().max(100),
      employer_id: z.string().max(30),
      bank_code: z.string().max(20),
      bank_name: z.string().max(60),
      iban: z.string().max(34),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await ensureHrOrOwner(context.supabase, context.userId);
    const { data: existing } = await context.supabase.from("org_settings").select("id").limit(1).maybeSingle();
    if (existing) {
      const { error } = await context.supabase.from("org_settings").update(data).eq("id", (existing as any).id);
      if (error) throw mapDbError(error);
    } else {
      const { error } = await context.supabase.from("org_settings").insert(data);
      if (error) throw mapDbError(error);
    }
    return { ok: true };
  });
