import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export type HolidayKind = "national" | "religious" | "company" | "weekend_override";

export interface HolidayRow {
  id: string;
  name_ar: string;
  name_en: string;
  start_date: string;
  end_date: string;
  kind: HolidayKind;
  country: string;
  paid: boolean;
  notes: string | null;
}

export const listHolidays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HolidayRow[]> => {
    const { data, error } = await context.supabase
      .from("holidays")
      .select("*")
      .order("start_date", { ascending: true });
    if (error) throw mapDbError(error);
    return (data ?? []) as HolidayRow[];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().min(1).max(120),
  name_en: z.string().min(1).max(120),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  kind: z.enum(["national", "religious", "company", "weekend_override"]),
  country: z.string().min(2).max(4),
  paid: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const payload = { ...data, notes: data.notes ?? null };
    if (data.id) {
      const { error } = await context.supabase.from("holidays").update(payload).eq("id", data.id);
      if (error) throw mapDbError(error);
      return { id: data.id };
    }
    const { id: _omit, ...insertPayload } = payload as any;
    const { data: row, error } = await context.supabase.from("holidays").insert(insertPayload).select("id").single();
    if (error) throw mapDbError(error);
    return { id: row.id };
  });

export const deleteHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("holidays").delete().eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
