import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export interface ShiftRow {
  id: string;
  name_ar: string;
  name_en: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  active: boolean;
}

export interface EmployeeShiftRow {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_id: string;
  shift_name: string;
  shift_color: string;
  effective_from: string;
  effective_to: string | null;
}

export const listShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShiftRow[]> => {
    const { data, error } = await context.supabase
      .from("shifts")
      .select("*")
      .order("start_time");
    if (error) throw mapDbError(error);
    return (data ?? []) as ShiftRow[];
  });

const upsertShiftSchema = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1).max(60),
  name_en: z.string().min(1).max(60),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  break_minutes: z.number().min(0).max(480),
  color: z.string().min(4).max(20),
  active: z.boolean().default(true),
});

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertShiftSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = {
      name_ar: data.name_ar,
      name_en: data.name_en,
      start_time: data.start_time + ":00",
      end_time: data.end_time + ":00",
      break_minutes: data.break_minutes,
      color: data.color,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("shifts").update(payload).eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("shifts").insert(payload).select("id").single();
    if (error) throw mapDbError(error);
    return { id: row.id };
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("shifts").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const listEmployeeShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmployeeShiftRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("employee_shifts")
      .select("id, employee_id, shift_id, effective_from, effective_to")
      .order("effective_from", { ascending: false });
    if (error) throw mapDbError(error);

    const empIds = Array.from(new Set((rows ?? []).map((r) => r.employee_id)));
    const shiftIds = Array.from(new Set((rows ?? []).map((r) => r.shift_id)));
    const [{ data: emps }, { data: shifts }] = await Promise.all([
      empIds.length ? supabase.from("employees").select("id, user_id").in("id", empIds) : Promise.resolve({ data: [] as any[] }),
      shiftIds.length ? supabase.from("shifts").select("id, name_ar, color").in("id", shiftIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const userIds = (emps ?? []).map((e: any) => e.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const empMap = new Map((emps ?? []).map((e: any) => [e.id, e.user_id]));
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id, s]));

    return (rows ?? []).map((r) => {
      const s = shiftMap.get(r.shift_id) as any;
      return {
        ...r,
        employee_name: (profMap.get(empMap.get(r.employee_id)!) as string) || "—",
        shift_name: s?.name_ar ?? "—",
        shift_color: s?.color ?? "#64748b",
      };
    });
  });

const assignSchema = z.object({
  employee_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  effective_from: z.string().min(10),
  effective_to: z.string().min(10).optional().nullable(),
});

export const assignEmployeeShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("employee_shifts").insert({
      employee_id: data.employee_id,
      shift_id: data.shift_id,
      effective_from: data.effective_from,
      effective_to: data.effective_to || null,
    });
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const removeEmployeeShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("employee_shifts").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
