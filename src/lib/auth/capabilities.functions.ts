import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/auth/roles.functions";

/**
 * Capabilities are the *actions* the app guards, decoupled from roles.
 * Which roles hold each capability lives in `public.role_capabilities`
 * and is edited from the access-control page. `owner` and `admin`
 * implicitly hold every capability (enforced in `public.has_capability`).
 */
export const CAPABILITIES = [
  "attendance_edit",
  "attendance_correction_review",
  "leave_review",
  "payroll_generate",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Roles that can be granted a capability (owner/admin are implicit). */
export const GRANTABLE_ROLES: AppRole[] = ["hr_admin", "dept_manager", "accountant", "employee"];

export interface CapabilityMatrix {
  capability: string;
  roles: string[];
}

export const listRoleCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CapabilityMatrix[]> => {
    const { data, error } = await context.supabase
      .from("role_capabilities")
      .select("capability, role");
    if (error) throw new Error(error.message);
    return CAPABILITIES.map((c) => ({
      capability: c,
      roles: (data ?? []).filter((r) => r.capability === c).map((r) => r.role as string),
    }));
  });

export const setCapabilityRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        capability: z.enum(CAPABILITIES),
        roles: z.array(z.string()).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only owner/admin may change the matrix — RLS enforces it too, this
    // gives a clear error instead of a silent no-op.
    const { data: myRoles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const list = (myRoles ?? []).map((r) => r.role as string);
    if (!list.includes("owner") && !list.includes("admin")) {
      throw new Error("تعديل مصفوفة الصلاحيات متاح لمالك النظام والمدير العام فقط");
    }

    const roles = data.roles.filter((r) => (GRANTABLE_ROLES as string[]).includes(r));

    const { error: delErr } = await context.supabase
      .from("role_capabilities")
      .delete()
      .eq("capability", data.capability);
    if (delErr) throw new Error(delErr.message);

    if (roles.length) {
      const { error: insErr } = await context.supabase
        .from("role_capabilities")
        .insert(roles.map((role) => ({ capability: data.capability, role: role as AppRole })));
      if (insErr) throw new Error(insErr.message);
    }

    await context.supabase.from("security_audit_log").insert({
      entity_type: "role_capabilities",
      entity_id: null,
      action: "capability_updated",
      actor_user_id: context.userId,
      actor_kind: "user",
      metadata: { capability: data.capability, roles },
    });

    return { ok: true, roles };
  });
