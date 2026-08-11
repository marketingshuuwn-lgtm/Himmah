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
  name: "list_my_attendance",
  title: "List my attendance",
  description:
    "List the signed-in employee's attendance records within an optional date range.",
  inputSchema: {
    from: z.string().optional().describe("ISO date (YYYY-MM-DD) lower bound."),
    to: z.string().optional().describe("ISO date (YYYY-MM-DD) upper bound."),
    limit: z.number().int().min(1).max(200).default(30),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
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
      .from("attendance_records")
      .select("id, work_date, check_in_at, check_out_at, status, late_minutes")
      .eq("employee_id", emp.id)
      .order("work_date", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("work_date", from);
    if (to) q = q.lte("work_date", to);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
