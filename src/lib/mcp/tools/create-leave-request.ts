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
  name: "create_leave_request",
  title: "Create leave request",
  description:
    "Submit a leave request for the signed-in employee. Status is set to pending.",
  inputSchema: {
    leave_type_id: z.string().uuid().describe("Leave type UUID (see list_leave_types)."),
    start_date: z.string().describe("ISO date YYYY-MM-DD."),
    end_date: z.string().describe("ISO date YYYY-MM-DD."),
    reason: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ leave_type_id, start_date, end_date, reason }, ctx) => {
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
        isError: true,
      };
    const days =
      Math.max(
        1,
        Math.round(
          (new Date(end_date).getTime() - new Date(start_date).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1,
      );
    const { data, error } = await sb
      .from("leave_requests")
      .insert({
        employee_id: emp.id,
        leave_type_id,
        start_date,
        end_date,
        days,
        reason: reason ?? null,
        status: "pending",
      })
      .select()
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created leave request ${data.id}` }],
      structuredContent: { row: data },
    };
  },
});
