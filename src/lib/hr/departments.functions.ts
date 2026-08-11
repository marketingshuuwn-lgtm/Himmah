import { createServerFn } from "@tanstack/react-start";
import { mapDbError } from "@/lib/hr/db-errors";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  manager_id: string | null;
  manager_name: string | null;
  employee_count: number;
  created_at: string;
}

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DepartmentRow[]> => {
    const { supabase } = context;
    const { data: deps, error } = await supabase
      .from("departments")
      .select("id, name, code, description, manager_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw mapDbError(error);

    const managerIds = Array.from(new Set((deps ?? []).map((d) => d.manager_id).filter(Boolean) as string[]));
    const { data: managers } = managerIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", managerIds)
      : { data: [] as { id: string; full_name: string }[] };

    const { data: emps } = await supabase.from("employees").select("department_id");
    const counts = new Map<string, number>();
    (emps ?? []).forEach((e) => {
      if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1);
    });

    const mgrMap = new Map((managers ?? []).map((m) => [m.id, m.full_name] as const));

    return (deps ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code ?? null,
      description: d.description,
      manager_id: d.manager_id,
      manager_name: d.manager_id ? mgrMap.get(d.manager_id) ?? null : null,
      employee_count: counts.get(d.id) ?? 0,
      created_at: d.created_at,
    }));
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  code: z
    .string()
    .trim()
    .max(8)
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, "الرمز يبدأ بحرف ويحتوي أحرف وأرقام إنجليزية فقط")
    .optional()
    .nullable(),
  description: z.string().max(500).optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
});

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      name: data.name,
      code: data.code ? data.code.toUpperCase() : null,
      description: data.description ?? null,
      manager_id: data.manager_id || null,
    };
    if (data.id) {
      const { error } = await supabase.from("departments").update(payload).eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase.from("departments").insert(payload).select("id").single();
    if (error) throw mapDbError(error);
    return { id: inserted.id };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("departments").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const listEligibleManagers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");
    if (error) throw mapDbError(error);
    return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || "بدون اسم" }));
  });
