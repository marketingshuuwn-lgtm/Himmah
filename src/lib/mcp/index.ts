import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listMyLeaves from "./tools/list-my-leaves";
import listMyAttendance from "./tools/list-my-attendance";
import listLeaveTypes from "./tools/list-leave-types";
import createLeaveRequest from "./tools/create-leave-request";

// The OAuth issuer must be the direct Supabase host (RFC 8414 issuer match).
// SUPABASE_URL is rewritten to a .lovable.cloud proxy on publish, which
// mcp-js rejects. VITE_SUPABASE_PROJECT_ID is inlined at build time.
const projectRef =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "alamaa-hr-mcp",
  title: "ALAMAA HR",
  version: "0.1.0",
  instructions:
    "Tools for the ALAMAA HR app. Every tool runs as the signed-in employee and respects role-based access. Use `whoami` first to discover the caller's employee and roles.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listLeaveTypes, listMyLeaves, createLeaveRequest, listMyAttendance],
});
