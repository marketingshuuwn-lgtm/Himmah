// Shared auth guard for public cron hook endpoints.
// Accepts Authorization: Bearer <token> where <token> matches EITHER:
//   - CRON_SHARED_SECRET (preferred: dedicated, rotatable, minimum privilege), or
//   - SUPABASE_SERVICE_ROLE_KEY (legacy fallback used by pg_cron until it's
//     migrated to the dedicated secret).
// Comparison is constant-time to avoid leaking secret length via timing.
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a constant-time compare against a same-length buffer so
    // the caller can't distinguish length mismatch from value mismatch.
    timingSafeEqual(ab, Buffer.alloc(ab.length));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function requireCronAuth(request: Request): Response | null {
  const preferred = process.env.CRON_SHARED_SECRET;
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!preferred && !legacy) {
    return new Response(JSON.stringify({ ok: false, error: "server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ok = (preferred && safeEqual(token, preferred)) || (legacy && safeEqual(token, legacy));
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
