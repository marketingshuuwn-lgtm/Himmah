import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_leaves",
  title: "List my leave requests",
  description: "List the signed-in employee's leave requests, most recent first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return."),
    status: z
      .enum(["draft", "pending", "approved", "rejected", "cancelled"])
      .optional()
      .describe("Filter by status."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data: emp } = await sb
      .from("employees")
      .select("id")
      .eq("user_id", ctx.getUserId()!)
      .maybeSingle();
    if (!emp)
      return {
        content: [{ type: "text", text: "No employee record linked to this user." }],
        structuredContent: { rows: [] },
      };
    let q = sb
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, days, reason, status, created_at")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
