import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export interface EvaluableEmployee {
  id: string;
  full_name: string;
  employee_no: string;
  position: string;
  department_id: string | null;
  department_name: string | null;
}

export interface EvaluationRow {
  id: string;
  employee_id: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  evaluator_id: string;
  evaluator_name: string;
  period: string;
  performance: number;
  commitment: number;
  teamwork: number;
  quality: number;
  average: number;
  notes: string | null;
  created_at: string;
}

const score = z.number().int().min(1).max(5);

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "صيغة الفترة YYYY-MM"),
  performance: score,
  commitment: score,
  teamwork: score,
  quality: score,
  notes: z.string().max(2000).optional().nullable(),
});

async function hydrate(
  supabase: any,
  rows: any[],
): Promise<EvaluationRow[]> {
  if (!rows.length) return [];
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id)));
  const evaluatorIds = Array.from(new Set(rows.map((r) => r.evaluator_id)));

  const { data: emps } = await supabase
    .from("employees")
    .select("id, user_id, employee_no, department_id")
    .in("id", empIds);

  const empUserIds = (emps ?? []).map((e: any) => e.user_id);
  const depIds = Array.from(
    new Set((emps ?? []).map((e: any) => e.department_id).filter(Boolean)),
  ) as string[];
  const profileIds = Array.from(new Set([...empUserIds, ...evaluatorIds]));

  const [{ data: profiles }, { data: deps }] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    depIds.length
      ? supabase.from("departments").select("id, name").in("id", depIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pMap = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.full_name]));
  const dMap = new Map<string, string>((deps ?? []).map((d: any) => [d.id, d.name]));
  const eMap = new Map<string, any>((emps ?? []).map((e: any) => [e.id, e]));

  return rows.map((r) => {
    const emp = eMap.get(r.employee_id) as any;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp ? pMap.get(emp.user_id) ?? "بدون اسم" : "—",
      department_id: emp?.department_id ?? null,
      department_name: emp?.department_id ? dMap.get(emp.department_id) ?? null : null,
      evaluator_id: r.evaluator_id,
      evaluator_name: pMap.get(r.evaluator_id) ?? "—",
      period: r.period,
      performance: r.performance,
      commitment: r.commitment,
      teamwork: r.teamwork,
      quality: r.quality,
      average: Number(r.average),
      notes: r.notes,
      created_at: r.created_at,
    };
  });
}

export const listEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvaluationRow[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);
    return hydrate(supabase, data ?? []);
  });

export const listEvaluableEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EvaluableEmployee[]> => {
    const { supabase, userId } = context;

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (rolesData ?? []).map((r: any) => r.role);
    const isHR = roles.includes("hr_admin");

    let query = supabase
      .from("employees")
      .select("id, user_id, employee_no, position, department_id")
      .eq("status", "active");

    if (!isHR) {
      const { data: myDeps } = await supabase
        .from("departments")
        .select("id")
        .eq("manager_id", userId);
      const depIds = (myDeps ?? []).map((d: any) => d.id);
      if (depIds.length === 0) return [];
      query = query.in("department_id", depIds);
    }

    const { data: emps, error } = await query;
    if (error) throw mapDbError(error);

    const userIds = Array.from(new Set((emps ?? []).map((e: any) => e.user_id)));
    const depIds = Array.from(
      new Set((emps ?? []).map((e: any) => e.department_id).filter(Boolean)),
    ) as string[];

    const [{ data: profiles }, { data: deps }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
      depIds.length
        ? supabase.from("departments").select("id, name").in("id", depIds)
        : Promise.resolve({ data: [] }),
    ]);
    const pMap = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const dMap = new Map<string, string>((deps ?? []).map((d: any) => [d.id, d.name]));

    return (emps ?? []).map((e: any) => ({
      id: e.id,
      full_name: pMap.get(e.user_id) ?? "بدون اسم",
      employee_no: e.employee_no,
      position: e.position,
      department_id: e.department_id,
      department_name: e.department_id ? dMap.get(e.department_id) ?? null : null,
    }));
  });

export const upsertEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      employee_id: data.employee_id,
      evaluator_id: userId,
      period: data.period,
      performance: data.performance,
      commitment: data.commitment,
      teamwork: data.teamwork,
      quality: data.quality,
      notes: data.notes ?? null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("evaluations")
        .update(payload)
        .eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("evaluations")
      .upsert(payload, { onConflict: "employee_id,period" })
      .select("id")
      .single();
    if (error) throw mapDbError(error);
    return { id: ins!.id };
  });

export const deleteEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("evaluations")
      .delete()
      .eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
