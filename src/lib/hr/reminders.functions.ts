import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";

interface ReminderResult {
  documents_notified: number;
  contracts_notified: number;
  skipped_dupes: number;
}

/**
 * Scans for documents expiring within 30 days and contracts sent but not signed
 * for > 3 days, and creates a notification per affected user. Idempotent within
 * the same calendar day by checking same `link` for the same user_id in the
 * last 24h.
 */
export const runReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderResult> => {
    const { supabase, userId } = context;

    // Authorization: HR admin only
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const set = new Set((roles ?? []).map((r: any) => r.role));
    if (!set.has("hr_admin")) {
      throw new Error("صلاحية الإدارة فقط");
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let documentsNotified = 0;
    let contractsNotified = 0;
    let skipped = 0;

    // ---------- 1) Documents expiring in <= 30 days ----------
    const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const { data: docs, error: dErr } = await supabase
      .from("employee_documents")
      .select("id, title, category, expiry_date, employee_id")
      .not("expiry_date", "is", null)
      .gte("expiry_date", today)
      .lte("expiry_date", cutoff);
    if (dErr) throw mapDbError(dErr);

    if (docs && docs.length) {
      const empIds = Array.from(new Set(docs.map((d: any) => d.employee_id)));
      const { data: emps } = await supabase
        .from("employees")
        .select("id, user_id")
        .in("id", empIds);
      const userByEmp = new Map((emps ?? []).map((e: any) => [e.id, e.user_id as string]));

      for (const d of docs as any[]) {
        const uid = userByEmp.get(d.employee_id);
        if (!uid) continue;
        const link = `/documents#${d.id}`;
        // Dedupe — same link within 24h
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", uid)
          .eq("link", link)
          .gte("created_at", since)
          .limit(1);
        if (existing && existing.length) { skipped++; continue; }

        const days = Math.ceil(
          (new Date(d.expiry_date).getTime() - Date.now()) / 86400000,
        );
        const { error: nErr } = await supabase.from("notifications").insert({
          user_id: uid,
          kind: "warning",
          title: `وثيقة ستنتهي خلال ${days} يوم`,
          body: `${d.title} — تاريخ الانتهاء ${d.expiry_date}`,
          link,
        });
        if (!nErr) documentsNotified++;
      }
    }

    // ---------- 2) Contracts sent > 3 days unsigned ----------
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: cts, error: cErr } = await supabase
      .from("contracts")
      .select("id, title, employee_id, sent_at")
      .eq("status", "sent")
      .lt("sent_at", threeDaysAgo);
    if (cErr) throw mapDbError(cErr);

    if (cts && cts.length) {
      const empIds = Array.from(new Set(cts.map((c: any) => c.employee_id)));
      const { data: emps } = await supabase
        .from("employees")
        .select("id, user_id")
        .in("id", empIds);
      const userByEmp = new Map((emps ?? []).map((e: any) => [e.id, e.user_id as string]));

      for (const c of cts as any[]) {
        const uid = userByEmp.get(c.employee_id);
        if (!uid) continue;
        const link = `/contracts#${c.id}`;
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", uid)
          .eq("link", link)
          .gte("created_at", since)
          .limit(1);
        if (existing && existing.length) { skipped++; continue; }

        const { error: nErr } = await supabase.from("notifications").insert({
          user_id: uid,
          kind: "contract",
          title: "تذكير: عقد بانتظار توقيعك",
          body: c.title,
          link,
        });
        if (!nErr) contractsNotified++;
      }
    }

    return {
      documents_notified: documentsNotified,
      contracts_notified: contractsNotified,
      skipped_dupes: skipped,
    };
  });
