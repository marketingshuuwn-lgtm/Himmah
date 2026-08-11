import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapDbError } from "@/lib/hr/db-errors";
import type { AppRole } from "@/lib/auth/roles.functions";

export interface UserWithRoles {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: AppRole[];
  is_owner: boolean;
  created_at: string;
}

async function assertOwnerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const set = new Set((data ?? []).map((r: any) => r.role));
  if (!set.has("owner") && !set.has("admin")) {
    throw new Error("هذه الصفحة متاحة للمالك أو المدير العام فقط");
  }
  return { isOwner: set.has("owner"), isAdmin: set.has("admin") };
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserWithRoles[]> => {
    const { supabase, userId } = context;
    await assertOwnerOrAdmin(supabase, userId);

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw mapDbError(error);

    const ids = (profiles ?? []).map((p: any) => p.id);
    if (ids.length === 0) return [];

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    }

    // Emails via admin — load lazily inside handler (paginated, no 200-user cap)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAllAuthUserEmails } = await import("@/lib/auth/admin-users.server");
    let emailByUser = new Map<string, string | null>();
    try {
      emailByUser = await listAllAuthUserEmails(supabaseAdmin);
    } catch {
      // fall back silently
    }

    return (profiles ?? []).map((p: any) => {
      const userRoles = rolesByUser.get(p.id) ?? [];
      return {
        user_id: p.id,
        full_name: p.full_name ?? "",
        email: emailByUser.get(p.id) ?? null,
        roles: userRoles,
        is_owner: userRoles.includes("owner"),
        created_at: p.created_at,
      };
    });
  });

const ASSIGNABLE_ROLES: AppRole[] = ["admin", "hr_admin", "dept_manager", "accountant", "employee"];

const updateRolesSchema = z.object({
  target_user_id: z.string().uuid(),
  roles: z
    .array(z.enum(ASSIGNABLE_ROLES as [AppRole, ...AppRole[]]))
    .min(0)
    .max(10),
});

export const updateUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateRolesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwnerOrAdmin(supabase, userId);

    // Fetch existing roles for target
    const { data: existing, error: exErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.target_user_id);
    if (exErr) throw mapDbError(exErr);

    const existingSet = new Set((existing ?? []).map((r: any) => r.role as AppRole));
    const nextSet = new Set(data.roles);

    // Never allow removing/changing owner via this fn
    if (existingSet.has("owner")) nextSet.add("owner");

    // Compute diff
    const toAdd: AppRole[] = [...nextSet].filter((r) => !existingSet.has(r) && r !== "owner");
    const toRemove: AppRole[] = [...existingSet].filter((r) => !nextSet.has(r) && r !== "owner");

    if (toRemove.length) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.target_user_id)
        .in("role", toRemove);
      if (error) throw mapDbError(error);
    }

    if (toAdd.length) {
      const { error } = await supabase
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: data.target_user_id, role })));
      if (error) throw mapDbError(error);
    }

    return { added: toAdd, removed: toRemove };
  });

const transferSchema = z.object({ new_owner_id: z.string().uuid() });

export const transferOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isOwner } = await assertOwnerOrAdmin(supabase, userId);
    if (!isOwner) throw new Error("نقل الملكية يُنفَّذ فقط بواسطة المالك الحالي");
    if (data.new_owner_id === userId) throw new Error("أنت المالك الحالي بالفعل");

    // Add owner role to new owner first (trigger allows because current owner is caller)
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: data.new_owner_id, role: "owner" });
    if (insErr && !String(insErr.message).includes("duplicate")) throw mapDbError(insErr);

    // Then remove owner from current user (trigger allows because another owner exists)
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "owner");
    if (delErr) throw mapDbError(delErr);

    return { ok: true };
  });
