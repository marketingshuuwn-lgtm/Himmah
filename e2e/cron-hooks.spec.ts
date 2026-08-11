import { test, expect, request } from "@playwright/test";

// Cron hooks must reject calls without the service-role bearer token.
const HOOKS = [
  "/api/public/hooks/monthly-payroll",
  "/api/public/hooks/attendance-reminders",
];

for (const hook of HOOKS) {
  test(`unauthenticated POST to ${hook} is rejected`, async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post(hook, { data: {} });
    expect([401, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });

  test(`bogus bearer to ${hook} is rejected`, async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL });
    const res = await ctx.post(hook, {
      data: {},
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect([401, 403, 404]).toContain(res.status());
    await ctx.dispose();
  });
}
