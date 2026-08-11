import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRON_JOB_LABELS, buildCronHealth, type CronHealthRow } from "@/lib/hr/cron-health.server";
import { assertManagementRole } from "@/lib/hr/attendance-rules.server";

export type { CronHealthRow };

/**
 * Health of the scheduled jobs: last time each one actually ran, derived from
 * the security audit trail the cron hooks write on every invocation.
 */
export const getCronHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CronHealthRow[]> => {
    const { supabase, userId } = context;
    await assertManagementRole(supabase, userId, ["owner", "admin", "hr_admin"]);
    const { data } = await supabase
      .from("security_audit_log")
      .select("action, created_at")
      .eq("actor_kind", "cron")
      .in("action", Object.keys(CRON_JOB_LABELS))
      .order("created_at", { ascending: false })
      .limit(500);
    return buildCronHealth(data ?? []);
  });
