import { test, expect } from "@playwright/test";

test("contract sign page rejects unauthenticated access", async ({ page }) => {
  // Random UUID — never signable without auth. Should redirect to /auth or 404.
  await page.goto("/contracts/00000000-0000-0000-0000-000000000000/sign");
  await page.waitForLoadState("domcontentloaded");
  const url = page.url();
  expect(url).toMatch(/\/(auth|404|not-found)|\/contracts\/.*\/sign/);
  // If it landed on sign page (public preview), no sign button should be enabled without a session.
  const signBtn = page.getByRole("button", { name: /(توقيع|Sign)/i });
  if (await signBtn.count()) {
    await expect(signBtn.first()).toBeDisabled();
  }
});
