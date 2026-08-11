import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computePayrollRows, type EngineRule } from "@/lib/hr/payroll-engine";
import { riyadhToday, lastDateOfMonth, nextMonthStart } from "@/lib/hr/time";

export interface BonusRow {
  id: string;
  employee_id: string;
  employee_name: string;
  amount: number;
  reason: string;
  period_month: string;
  created_at: string;
}
export type DeductionRow = BonusRow;

export interface PayrollRunRow {
  id: string;
  employee_id: string;
  employee_name: string;
  period_month: string;
  base_salary: number;
  allowances: number;
  bonuses_total: number;
  deductions_total: number;
  absence_days: number;
  absence_deduction: number;
  late_minutes: number;
  late_deduction: number;
  net_salary: number;
  generated_at: string;
  locked_at?: string | null;
  approval_status:
    | "draft"
    | "pending_admin_approval"
    | "approved"
    | "sent_to_employee"
    | "employee_approved"
    | "employee_objected";
  approved_at: string | null;
  employee_decided_at: string | null;
}

const monthInput = z.object({ period_month: z.string().min(7) });

async function loadEmployeeNames(supabase: any, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data: emps } = await supabase.from("employees").select("id, user_id").in("id", ids);
  const userIds = Array.from(new Set((emps ?? []).map((e: any) => e.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
  return new Map((emps ?? []).map((e: any) => [e.id, (pMap.get(e.user_id) as string) || "—"]));
}

// ---------- Bonuses ----------
export const listBonuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthInput.parse(d))
  .handler(async ({ data, context }): Promise<BonusRow[]> => {
    const { supabase } = context;
    const start = data.period_month;
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const endStr = end.toISOString().slice(0, 10);
    const { data: rows, error } = await supabase
      .from("bonuses")
      .select("id, employee_id, amount, reason, period_month, created_at")
      .gte("period_month", start)
      .lt("period_month", endStr)
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    const names = await loadEmployeeNames(
      supabase,
      (rows ?? []).map((r) => r.employee_id),
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: names.get(r.employee_id) || "—",
      amount: Number(r.amount),
      reason: r.reason ?? "",
      period_month: r.period_month,
      created_at: r.created_at,
    }));
  });

const upsertBonusSchema = z.object({
  employee_id: z.string().uuid(),
  amount: z.number().min(0).max(10_000_000),
  reason: z.string().max(500).default(""),
  period_month: z.string().min(7),
});
export const addBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertBonusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bonuses").insert({
      employee_id: data.employee_id,
      amount: data.amount,
      reason: data.reason,
      period_month: data.period_month,
      created_by: context.userId,
    });
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const deleteBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bonuses").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

// ---------- Deductions ----------
export const listDeductions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthInput.parse(d))
  .handler(async ({ data, context }): Promise<DeductionRow[]> => {
    const { supabase } = context;
    const start = data.period_month;
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const endStr = end.toISOString().slice(0, 10);
    const { data: rows, error } = await supabase
      .from("deductions")
      .select("id, employee_id, amount, reason, period_month, created_at")
      .gte("period_month", start)
      .lt("period_month", endStr)
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    const names = await loadEmployeeNames(
      supabase,
      (rows ?? []).map((r) => r.employee_id),
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: names.get(r.employee_id) || "—",
      amount: Number(r.amount),
      reason: r.reason ?? "",
      period_month: r.period_month,
      created_at: r.created_at,
    }));
  });

export const addDeduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertBonusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deductions").insert({
      employee_id: data.employee_id,
      amount: data.amount,
      reason: data.reason,
      period_month: data.period_month,
      created_by: context.userId,
    });
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const deleteDeduction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deductions").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

// ---------- Payroll runs ----------
// Calculation lives in @/lib/hr/payroll-engine (shared with the monthly cron hook).

export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthInput.parse(d))
  .handler(async ({ data, context }): Promise<PayrollRunRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("payroll_runs")
      .select(
        "id, employee_id, period_month, base_salary, allowances, bonuses_total, deductions_total, absence_days, absence_deduction, late_minutes, late_deduction, net_salary, generated_at, locked_at, approval_status, approved_at, employee_decided_at",
      )
      .eq("period_month", data.period_month)
      .order("generated_at", { ascending: false });
    if (error) throw mapDbError(error);
    const names = await loadEmployeeNames(
      supabase,
      (rows ?? []).map((r) => r.employee_id),
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: names.get(r.employee_id) || "—",
      period_month: r.period_month,
      base_salary: Number(r.base_salary),
      allowances: Number(r.allowances),
      bonuses_total: Number(r.bonuses_total),
      deductions_total: Number(r.deductions_total),
      absence_days: r.absence_days,
      absence_deduction: Number(r.absence_deduction),
      late_minutes: r.late_minutes,
      late_deduction: Number(r.late_deduction),
      net_salary: Number(r.net_salary),
      generated_at: r.generated_at,
      locked_at: r.locked_at ?? null,
      approval_status: r.approval_status as PayrollRunRow["approval_status"],
      approved_at: r.approved_at ?? null,
      employee_decided_at: r.employee_decided_at ?? null,
    }));
  });

export const myPayroll = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayrollRunRow[]> => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return [];
    const { data: rows, error } = await supabase
      .from("payroll_runs")
      .select(
        "id, employee_id, period_month, base_salary, allowances, bonuses_total, deductions_total, absence_days, absence_deduction, late_minutes, late_deduction, net_salary, generated_at, approval_status, approved_at, employee_decided_at",
      )
      .eq("employee_id", emp.id)
      // The employee only ever sees a payslip once HR/admin has actually
      // sent it — drafts and pending-approval runs stay internal.
      .in("approval_status", ["sent_to_employee", "employee_approved", "employee_objected"])
      .order("period_month", { ascending: false })
      .limit(24);
    if (error) throw mapDbError(error);
    const names = await loadEmployeeNames(
      supabase,
      (rows ?? []).map((r) => r.employee_id),
    );
    return (rows ?? []).map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: names.get(r.employee_id) || "—",
      period_month: r.period_month,
      base_salary: Number(r.base_salary),
      allowances: Number(r.allowances),
      bonuses_total: Number(r.bonuses_total),
      deductions_total: Number(r.deductions_total),
      absence_days: r.absence_days,
      absence_deduction: Number(r.absence_deduction),
      late_minutes: r.late_minutes,
      late_deduction: Number(r.late_deduction),
      net_salary: Number(r.net_salary),
      generated_at: r.generated_at,
      approval_status: r.approval_status as PayrollRunRow["approval_status"],
      approved_at: r.approved_at ?? null,
      employee_decided_at: r.employee_decided_at ?? null,
    }));
  });

export const generatePayroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorization: HR or accountant only
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const set = new Set((roles ?? []).map((r: any) => r.role));
    if (!set.has("hr_admin") && !set.has("accountant")) {
      throw new Error("ليست لديك صلاحية لتوليد كشوف الرواتب");
    }

    // Idempotency guard: only one concurrent generation per month may proceed.
    // Two racing clicks (or a click racing with the cron) would otherwise
    // both upsert and both fire "ready for approval" notifications.
    const { error: lockErr } = await supabase
      .from("payroll_generation_locks")
      .insert({ period_month: data.period_month, locked_by: userId });
    if (lockErr) {
      // Unique-violation (23505) means another run holds the lock right now.
      if ((lockErr as any).code === "23505") {
        throw new Error("توليد الرواتب لهذا الشهر قيد التنفيذ حالياً — انتظر انتهاءه ثم أعد المحاولة");
      }
      throw mapDbError(lockErr);
    }
    try {



    const start = data.period_month;
    const endStr = nextMonthStart(start);
    // Cap absence counting at the earlier of "today (Riyadh)" and month end,
    // so generating mid-month never charges absence for days that haven't happened.
    const monthEnd = lastDateOfMonth(start);
    const today = riyadhToday();
    const asOfDate = today < monthEnd ? today : monthEnd;

    const { data: emps, error: eErr } = await supabase
      .from("employees")
      .select("id, department_id, base_salary, allowances, hire_date")
      .eq("status", "active");
    if (eErr) throw mapDbError(eErr);
    if (!emps?.length) return { generated: 0 };

    const empIds = emps.map((e) => e.id);

    const [rulesRes, att, bn, dd, hol] = await Promise.all([
      supabase
        .from("attendance_rules")
        .select("department_id, absence_deduction, late_deduction_per_minute, absence_calc_mode"),
      supabase
        .from("attendance_records")
        .select(
          "employee_id, work_date, status, late_minutes, late_deduction_amount, early_leave_deduction_amount",
        )
        .in("employee_id", empIds)
        .gte("work_date", start)
        .lt("work_date", endStr),
      supabase
        .from("bonuses")
        .select("employee_id, amount")
        .in("employee_id", empIds)
        .gte("period_month", start)
        .lt("period_month", endStr),
      supabase
        .from("deductions")
        .select("employee_id, amount")
        .in("employee_id", empIds)
        .gte("period_month", start)
        .lt("period_month", endStr),
      supabase
        .from("holidays")
        .select("start_date, end_date")
        .lte("start_date", monthEnd)
        .gte("end_date", start),
    ]);

    const generatedAt = new Date().toISOString();
    const computed = computePayrollRows({
      periodMonth: start,
      asOfDate,
      employees: emps,
      attendance: att.data ?? [],
      bonuses: bn.data ?? [],
      deductions: dd.data ?? [],
      rules: (rulesRes.data ?? []) as EngineRule[],
      holidays: hol.data ?? [],
    }).map((r) => ({
      ...r,
      generated_by: userId,
      generated_at: generatedAt,
      // Any (re)generation resets the approval cycle — including pulling a
      // previously-objected run back to draft for correction, matching the
      // "أعيد بناؤه من جديد" flow the employee's objection should trigger.
      approval_status: "draft" as const,
      approved_by: null,
      approved_at: null,
      employee_decided_at: null,
    }));

    // Never overwrite finalized (locked) rows, or rows already delivered
    // to / confirmed by the employee — regenerating other employees'
    // payroll must not silently reset someone else's already-sent payslip.
    const { data: protectedRows } = await supabase
      .from("payroll_runs")
      .select("employee_id, locked_at, approval_status")
      .eq("period_month", start);
    const protectedSet = new Set(
      (protectedRows ?? [])
        .filter(
          (r) =>
            r.locked_at != null ||
            r.approval_status === "sent_to_employee" ||
            r.approval_status === "employee_approved",
        )
        .map((r) => r.employee_id),
    );
    const rows = computed.filter((r) => !protectedSet.has(r.employee_id));

    if (rows.length) {
      const { error: upErr } = await supabase
        .from("payroll_runs")
        .upsert(rows, { onConflict: "employee_id,period_month" });
      if (upErr) throw mapDbError(upErr);
    }

    return { generated: rows.length, skipped_locked: protectedSet.size };
    } finally {
      await supabase
        .from("payroll_generation_locks")
        .delete()
        .eq("period_month", data.period_month);
    }
  });

const lockSchema = z.object({
  period_month: z.string().min(7),
  employee_id: z.string().uuid().optional(),
  locked: z.boolean(),
});

/**
 * Lock (finalize) or unlock payroll rows for a period — locked rows are
 * excluded from any future regeneration (manual or cron). HR/accountant only.
 */
export const setPayrollLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => lockSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const set = new Set((roles ?? []).map((r) => r.role));
    if (!set.has("hr_admin") && !set.has("accountant")) {
      throw new Error("Forbidden: hr_admin or accountant role required");
    }

    let q = supabase
      .from("payroll_runs")
      .update(
        data.locked
          ? { locked_at: new Date().toISOString(), locked_by: userId }
          : { locked_at: null, locked_by: null },
      )
      .eq("period_month", data.period_month);
    if (data.employee_id) q = q.eq("employee_id", data.employee_id);
    const { data: updated, error } = await q.select("id");
    if (error) throw mapDbError(error);

    await supabase.from("security_audit_log").insert({
      entity_type: "payroll_run",
      entity_id: data.employee_id ?? null,
      action: data.locked ? "lock" : "unlock",
      actor_user_id: userId,
      actor_kind: "user",
      metadata: {
        period_month: data.period_month,
        employee_id: data.employee_id ?? null,
        affected: updated?.length ?? 0,
      },
    });

    return { ok: true, affected: updated?.length ?? 0 };
  });

export const listEmployeesLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: emps } = await supabase
      .from("employees")
      .select("id, user_id, employee_no")
      .eq("status", "active");
    const userIds = Array.from(new Set((emps ?? []).map((e) => e.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    return (emps ?? []).map((e) => ({
      id: e.id,
      label: `${(pMap.get(e.user_id) as string) || "—"} (${e.employee_no})`,
    }));
  });

export const getPayrollRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PayrollRunRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("payroll_runs")
      .select(
        "id, employee_id, period_month, base_salary, allowances, bonuses_total, deductions_total, absence_days, absence_deduction, late_minutes, late_deduction, net_salary, generated_at, locked_at, approval_status, approved_at, employee_decided_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!row) throw new Error("القسيمة غير موجودة");

    // Authorization: HR/accountant OR the employee owning the record.
    const { data: emp } = await supabase
      .from("employees")
      .select("id, user_id")
      .eq("id", row.employee_id)
      .maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const set = new Set((roles ?? []).map((r: any) => r.role));
    const canSeeAll = set.has("hr_admin") || set.has("accountant");
    if (!canSeeAll && emp?.user_id !== userId) {
      throw new Error("ليست لديك صلاحية لعرض هذه القسيمة");
    }
    if (
      !canSeeAll &&
      !["sent_to_employee", "employee_approved", "employee_objected"].includes(row.approval_status)
    ) {
      throw new Error("لم يتم إرسال هذه القسيمة إليك بعد");
    }

    const names = await loadEmployeeNames(supabase, [row.employee_id]);
    return {
      id: row.id,
      employee_id: row.employee_id,
      employee_name: names.get(row.employee_id) || "—",
      period_month: row.period_month,
      base_salary: Number(row.base_salary),
      allowances: Number(row.allowances),
      bonuses_total: Number(row.bonuses_total),
      deductions_total: Number(row.deductions_total),
      absence_days: row.absence_days,
      absence_deduction: Number(row.absence_deduction),
      late_minutes: row.late_minutes,
      late_deduction: Number(row.late_deduction),
      net_salary: Number(row.net_salary),
      generated_at: row.generated_at,
      locked_at: row.locked_at ?? null,
      approval_status: row.approval_status as PayrollRunRow["approval_status"],
      approved_at: row.approved_at ?? null,
      employee_decided_at: row.employee_decided_at ?? null,
    };
  });

// -------------------- Detailed payslip breakdown --------------------
// Day-by-day source rows behind the payroll totals, so the exported PDF can
// show exactly which day produced which deduction — matching the numbers in
// the attendance preview and the "how was this computed?" dialog.

export interface PayslipDetailDay {
  work_date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  late_deduction: number;
  early_leave_minutes: number;
  early_leave_deduction: number;
}

export interface PayslipDetail {
  days: PayslipDetailDay[];
  bonuses: Array<{ reason: string; amount: number }>;
  deductions: Array<{ reason: string; amount: number }>;
  totals: {
    late_minutes: number;
    late_deduction: number;
    early_leave_minutes: number;
    early_leave_deduction: number;
  };
}

export const getPayslipDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PayslipDetail> => {
    const { supabase } = context;
    // RLS decides visibility of the run + its attendance/finance rows.
    const { data: run, error } = await supabase
      .from("payroll_runs")
      .select("employee_id, period_month")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw mapDbError(error);
    if (!run) throw new Error("القسيمة غير موجودة");

    const start = run.period_month;
    const d = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    const end = endDate.toISOString().slice(0, 10);

    const [{ data: recs }, { data: bonuses }, { data: deds }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select(
          "work_date, status, check_in_at, check_out_at, late_minutes, late_deduction_amount, early_leave_minutes, early_leave_deduction_amount",
        )
        .eq("employee_id", run.employee_id)
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date", { ascending: true }),
      supabase
        .from("bonuses")
        .select("reason, amount")
        .eq("employee_id", run.employee_id)
        .eq("period_month", start),
      supabase
        .from("deductions")
        .select("reason, amount")
        .eq("employee_id", run.employee_id)
        .eq("period_month", start),
    ]);

    const days: PayslipDetailDay[] = (recs ?? []).map((r: any) => ({
      work_date: r.work_date,
      status: r.status,
      check_in_at: r.check_in_at,
      check_out_at: r.check_out_at,
      late_minutes: Number(r.late_minutes || 0),
      late_deduction: Number(r.late_deduction_amount || 0),
      early_leave_minutes: Number(r.early_leave_minutes || 0),
      early_leave_deduction: Number(r.early_leave_deduction_amount || 0),
    }));

    return {
      days,
      bonuses: (bonuses ?? []).map((b: any) => ({ reason: b.reason, amount: Number(b.amount) })),
      deductions: (deds ?? []).map((b: any) => ({ reason: b.reason, amount: Number(b.amount) })),
      totals: {
        late_minutes: days.reduce((a, x) => a + x.late_minutes, 0),
        late_deduction: days.reduce((a, x) => a + x.late_deduction, 0),
        early_leave_minutes: days.reduce((a, x) => a + x.early_leave_minutes, 0),
        early_leave_deduction: days.reduce((a, x) => a + x.early_leave_deduction, 0),
      },
    };
  });

// -------------------- Payroll generation audit --------------------
// Recomputes the month from the live source data and diffs it against the
// stored payroll_runs so any drift (attendance edited after generation,
// bonuses added later, …) is visible before the payroll is finalized.

export interface PayrollAuditDiff {
  employee_id: string;
  employee_name: string;
  field: string;
  stored: number;
  expected: number;
}

export interface PayrollAuditResult {
  period_month: string;
  last_generated_at: string | null;
  stored_rows: number;
  expected_rows: number;
  missing_employees: string[];
  diffs: PayrollAuditDiff[];
}

const AUDIT_FIELDS = [
  "base_salary",
  "allowances",
  "bonuses_total",
  "deductions_total",
  "absence_days",
  "absence_deduction",
  "late_minutes",
  "late_deduction",
  "net_salary",
] as const;

export const auditPayrollPeriod = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => monthInput.parse(d))
  .handler(async ({ data, context }): Promise<PayrollAuditResult> => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const set = new Set((roles ?? []).map((r: any) => r.role as string));
    if (!set.has("hr_admin") && !set.has("accountant") && !set.has("owner") && !set.has("admin")) {
      throw new Error("هذه الصفحة مخصصة للموارد البشرية والمحاسبة");
    }

    const start = data.period_month;
    const endStr = nextMonthStart(start);
    const monthEnd = lastDateOfMonth(start);
    const today = riyadhToday();
    const asOfDate = today < monthEnd ? today : monthEnd;

    const { data: emps } = await supabase
      .from("employees")
      .select("id, department_id, base_salary, allowances, hire_date")
      .eq("status", "active");
    const empIds = (emps ?? []).map((e) => e.id);

    const [rulesRes, att, bn, dd, hol, stored] = await Promise.all([
      supabase
        .from("attendance_rules")
        .select("department_id, absence_deduction, late_deduction_per_minute, absence_calc_mode"),
      supabase
        .from("attendance_records")
        .select(
          "employee_id, work_date, status, late_minutes, late_deduction_amount, early_leave_deduction_amount",
        )
        .in("employee_id", empIds)
        .gte("work_date", start)
        .lt("work_date", endStr),
      supabase
        .from("bonuses")
        .select("employee_id, amount")
        .in("employee_id", empIds)
        .gte("period_month", start)
        .lt("period_month", endStr),
      supabase
        .from("deductions")
        .select("employee_id, amount")
        .in("employee_id", empIds)
        .gte("period_month", start)
        .lt("period_month", endStr),
      supabase
        .from("holidays")
        .select("start_date, end_date")
        .lte("start_date", monthEnd)
        .gte("end_date", start),
      supabase
        .from("payroll_runs")
        .select(
          "employee_id, base_salary, allowances, bonuses_total, deductions_total, absence_days, absence_deduction, late_minutes, late_deduction, net_salary, generated_at, locked_at",
        )
        .eq("period_month", start),
    ]);

    const expected = computePayrollRows({
      periodMonth: start,
      asOfDate,
      employees: emps ?? [],
      attendance: att.data ?? [],
      bonuses: bn.data ?? [],
      deductions: dd.data ?? [],
      rules: (rulesRes.data ?? []) as EngineRule[],
      holidays: hol.data ?? [],
    });

    const storedRows = stored.data ?? [];
    const storedMap = new Map(storedRows.map((r: any) => [r.employee_id, r]));
    const names = await loadEmployeeNames(
      supabase,
      Array.from(new Set([...expected.map((e) => e.employee_id), ...storedMap.keys()])),
    );

    const diffs: PayrollAuditDiff[] = [];
    const missing: string[] = [];
    for (const exp of expected) {
      const row = storedMap.get(exp.employee_id) as any;
      if (!row) {
        missing.push(names.get(exp.employee_id) || exp.employee_id);
        continue;
      }
      for (const f of AUDIT_FIELDS) {
        const a = Number((row as any)[f] ?? 0);
        const b = Number((exp as any)[f] ?? 0);
        if (Math.abs(a - b) > 0.01) {
          diffs.push({
            employee_id: exp.employee_id,
            employee_name: names.get(exp.employee_id) || "—",
            field: f,
            stored: a,
            expected: b,
          });
        }
      }
    }

    const lastGenerated = storedRows
      .map((r: any) => r.generated_at as string)
      .sort()
      .pop();

    return {
      period_month: start,
      last_generated_at: lastGenerated ?? null,
      stored_rows: storedRows.length,
      expected_rows: expected.length,
      missing_employees: missing,
      diffs,
    };
  });
