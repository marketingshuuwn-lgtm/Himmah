import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface CurrentUserInfo {
  userId: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  roles: AppRole[];
}

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUserInfo> => {
    const { supabase, userId, claims } = context;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    return {
      userId,
      email: (claims.email as string | undefined) ?? null,
      fullName: profile?.full_name ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      roles: (roles ?? []).map((r) => r.role as AppRole),
    };
  });
