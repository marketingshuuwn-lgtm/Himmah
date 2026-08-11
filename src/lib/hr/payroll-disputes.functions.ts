import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export type DisputeStatus = "pending" | "accepted" | "rejected";

export interface PayrollDisputeRow {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_name: string;
  period_month: string;
  reason: string;
  status: DisputeStatus;
  hr_response: string | null;
  reviewed_at: string | null;
  created_at: string;
}

async function loadEmpAndPeriod(supabase: any, disputes: any[]) {
  if (!disputes.length) return { empMap: new Map(), periodMap: new Map() };
  const empIds = Array.from(new Set(disputes.map((d) => d.employee_id)));
  const runIds = Array.from(new Set(disputes.map((d) => d.payroll_run_id)));

  const [{ data: emps }, { data: runs }] = await Promise.all([
    supabase.from("employees").select("id, user_id").in("id", empIds),
    supabase.from("payroll_runs").select("id, period_month").in("id", runIds),
  ]);
  const userIds = Array.from(new Set((emps ?? []).map((e: any) => e.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as any[] };
  const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
  const empMap = new Map(
    (emps ?? []).map((e: any) => [e.id, (pMap.get(e.user_id) as string) || "—"]),
  );
  const periodMap = new Map((runs ?? []).map((r: any) => [r.id, r.period_month]));
  return { empMap, periodMap };
}

// Open a dispute (employee)
const openSchema = z.object({
  payroll_run_id: z.string().uuid(),
  reason: z.string().min(5).max(2000),
});

export const openPayrollDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => openSchema.parse(d))
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
      .select("id, employee_id, period_month, approval_status")
      .eq("id", data.payroll_run_id)
      .maybeSingle();
    if (!run || run.employee_id !== emp.id) throw new Error("قسيمة غير موجودة");

    // Prevent duplicate pending disputes on same run
    const { data: existing } = await supabase
      .from("payroll_disputes")
      .select("id")
      .eq("payroll_run_id", data.payroll_run_id)
      .eq("employee_id", emp.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("لديك اعتراض قيد المراجعة على هذه القسيمة");

    const { data: inserted, error } = await supabase
      .from("payroll_disputes")
      .insert({
        payroll_run_id: data.payroll_run_id,
        employee_id: emp.id,
        opened_by: userId,
        reason: data.reason,
      })
      .select("id")
      .single();
    if (error) throw mapDbError(error);

    // Close the approval workflow loop: an objection means the payslip is
    // no longer confirmed — it must go back for HR review/correction.
    if (run.approval_status === "sent_to_employee") {
      await supabase
        .from("payroll_runs")
        .update({
          approval_status: "employee_objected",
          employee_decided_at: new Date().toISOString(),
        })
        .eq("id", data.payroll_run_id);
    }

    // Notify HR / accountants
    const { data: reviewers } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["hr_admin", "accountant"]);
    const targets = Array.from(new Set((reviewers ?? []).map((r: any) => r.user_id)));
    if (targets.length) {
      await supabase.from("notifications").insert(
        targets.map((uid) => ({
          user_id: uid,
          kind: "payroll" as const,
          title: "اعتراض جديد على قسيمة راتب",
          body: `تم فتح اعتراض بخصوص شهر ${run.period_month}`,
          link: "/payroll-disputes",
        })),
      );
    }

    return { ok: true, id: inserted.id };
  });

// My disputes on a specific payslip (employee)
export const myDisputesForRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ payroll_run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PayrollDisputeRow[]> => {
    const { supabase, userId } = context;
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!emp) return [];
    const { data: rows, error } = await supabase
      .from("payroll_disputes")
      .select(
        "id, payroll_run_id, employee_id, reason, status, hr_response, reviewed_at, created_at",
      )
      .eq("payroll_run_id", data.payroll_run_id)
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    const { empMap, periodMap } = await loadEmpAndPeriod(supabase, rows ?? []);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      payroll_run_id: r.payroll_run_id,
      employee_id: r.employee_id,
      employee_name: empMap.get(r.employee_id) || "—",
      period_month: periodMap.get(r.payroll_run_id) || "",
      reason: r.reason,
      status: r.status,
      hr_response: r.hr_response,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));
  });

// All disputes (HR)
export const listAllDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: z.enum(["pending", "accepted", "rejected", "all"]).default("all") })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PayrollDisputeRow[]> => {
    const { supabase } = context;
    let q = supabase
      .from("payroll_disputes")
      .select(
        "id, payroll_run_id, employee_id, reason, status, hr_response, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw mapDbError(error);
    const { empMap, periodMap } = await loadEmpAndPeriod(supabase, rows ?? []);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      payroll_run_id: r.payroll_run_id,
      employee_id: r.employee_id,
      employee_name: empMap.get(r.employee_id) || "—",
      period_month: periodMap.get(r.payroll_run_id) || "",
      reason: r.reason,
      status: r.status,
      hr_response: r.hr_response,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  hr_response: z.string().max(2000).default(""),
});

export const reviewDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("payroll_disputes")
      .select("id, employee_id, payroll_run_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("الاعتراض غير موجود");
    if (row.status !== "pending") throw new Error("هذا الاعتراض تمت مراجعته سابقاً");

    const { error } = await supabase
      .from("payroll_disputes")
      .update({
        status: data.status,
        hr_response: data.hr_response || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw mapDbError(error);

    // Notify employee
    const { data: emp } = await supabase
      .from("employees")
      .select("user_id")
      .eq("id", row.employee_id)
      .maybeSingle();
    if (emp?.user_id) {
      await supabase.from("notifications").insert({
        user_id: emp.user_id,
        kind: "payroll",
        title:
          data.status === "accepted" ? "تم قبول اعتراضك على الراتب" : "تم رفض اعتراضك على الراتب",
        body: data.hr_response || null,
        link: `/payslip/${row.payroll_run_id}`,
      });
    }
    return { ok: true };
  });
