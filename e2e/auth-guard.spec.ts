import { test, expect } from "@playwright/test";

const PROTECTED = ["/attendance", "/payroll", "/contracts", "/employees"];

for (const path of PROTECTED) {
  test(`unauthenticated visit to ${path} redirects to /auth`, async ({ page }) => {
    await page.goto(path);
    await page.waitForURL(/\/auth/, { timeout: 10_000 });
    expect(page.url()).toContain("/auth");
  });
}
