// Special work-hours periods: reduced Ramadan hours (a genuine Saudi
// Labor Law requirement — Jisr advertises this explicitly) or summer
// hours. A period overrides work_start/work_end for classification
// purposes while active, either company-wide (department_id = null) or
// scoped to one department.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export interface SpecialWorkPeriodRow {
  id: string;
  name_ar: string;
  department_id: string | null;
  department_name: string | null;
  start_date: string;
  end_date: string;
  work_start: string;
  work_end: string;
  notes: string | null;
}

async function assertHR(supabase: any, userId: string) {
  const { data: isHR } = await supabase.rpc("has_role", { _user_id: userId, _role: "hr_admin" });
  if (!isHR) throw new Error("Forbidden: hr_admin role required");
}

export const listSpecialWorkPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpecialWorkPeriodRow[]> => {
    const { supabase } = context;
    const [{ data: rows }, { data: depts }] = await Promise.all([
      supabase
        .from("special_work_periods")
        .select("id, name_ar, department_id, start_date, end_date, work_start, work_end, notes")
        .order("start_date", { ascending: false }),
      supabase.from("departments").select("id, name"),
    ]);
    const deptMap = new Map((depts ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));
    return (rows ?? []).map((r: any) => ({
      ...r,
      department_name: r.department_id ? (deptMap.get(r.department_id) ?? "—") : null,
    }));
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1).max(120),
  department_id: z.string().uuid().nullable(),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  work_start: z.string().regex(/^\d{2}:\d{2}$/),
  work_end: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertSpecialWorkPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertHR(supabase, userId);
    if (data.end_date < data.start_date) throw new Error("تاريخ النهاية قبل البداية");

    const payload = {
      name_ar: data.name_ar,
      department_id: data.department_id,
      start_date: data.start_date,
      end_date: data.end_date,
      work_start: data.work_start + ":00",
      work_end: data.work_end + ":00",
      notes: data.notes ?? null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("special_work_periods")
        .update(payload)
        .eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("special_work_periods")
      .insert({ ...payload, created_by: userId })
      .select("id")
      .single();
    if (error) throw mapDbError(error);
    return { id: row.id };
  });

export const deleteSpecialWorkPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertHR(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("special_work_periods")
      .delete()
      .eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
