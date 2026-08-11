import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in user's profile, employee record, and roles.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const [{ data: profile }, { data: employee }, { data: roles }] = await Promise.all([
      sb.from("profiles").select("id, full_name").eq("id", userId!).maybeSingle(),
      sb
        .from("employees")
        .select("id, employee_no, full_name, position, department_id, status, hire_date")
        .eq("user_id", userId!)
        .maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", userId!),
    ]);
    const out = {
      user_id: userId,
      email: ctx.getUserEmail?.() ?? null,
      profile: profile ?? null,
      employee: employee ?? null,
      roles: (roles ?? []).map((r: any) => r.role),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  },
});
