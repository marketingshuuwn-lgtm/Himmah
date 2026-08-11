import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

export type NotificationKind =
  | "info" | "success" | "warning" | "error"
  | "leave" | "permission" | "contract" | "payroll" | "attendance";

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: NotificationRow[]; unread: number }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw mapDbError(error);
    let items = (data ?? []) as NotificationRow[];

    // Suppress stale attendance reminders once the underlying action has
    // actually been performed — the notification is a scheduled batch and
    // often contradicts the real state on the dashboard.
    //   - "لم تسجّل حضورك" / أي تذكير حضور  ← suppress after check-in
    //   - "لا تنسَ تسجيل الانصراف" / تذكير انصراف ← suppress after check-out
    const today = new Date().toISOString().slice(0, 10);
    const { data: emp } = await supabase
      .from("employees").select("id").eq("user_id", userId).maybeSingle();
    if (emp?.id) {
      const { data: rec } = await supabase
        .from("attendance_records")
        .select("check_in_at, check_out_at")
        .eq("employee_id", emp.id)
        .eq("work_date", today)
        .maybeSingle();

      const stale: string[] = [];
      for (const n of items) {
        if (n.read_at) continue;
        const t = n.title ?? "";
        const isCheckInReminder =
          /لم\s*تسجّ?ل\s*حضورك/.test(t) || (/تذكير/.test(t) && /حضور/.test(t));
        const isCheckOutReminder =
          /لا\s*تنسَ?\s*تسجيل\s*الانصراف/.test(t) ||
          (/تذكير/.test(t) && /انصراف/.test(t));
        if (isCheckInReminder && rec?.check_in_at) stale.push(n.id);
        else if (isCheckOutReminder && rec?.check_out_at) stale.push(n.id);
      }
      if (stale.length) {
        const nowIso = new Date().toISOString();
        await supabase
          .from("notifications")
          .update({ read_at: nowIso })
          .in("id", stale);
        const staleSet = new Set(stale);
        items = items.map((n) => (staleSet.has(n.id) ? { ...n, read_at: nowIso } : n));
      }
    }

    const unread = items.filter((n) => !n.read_at).length;
    return { items, unread };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw mapDbError(error);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw mapDbError(error);
    return { ok: true };
  });
