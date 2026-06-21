import { expect, test } from "@playwright/test";

// The marketing landing page is public — no auth needed.
test.describe("Landing page", () => {
  test("renders the hero and trust sections", async ({ page }) => {
    await page.goto("/");
    // Hero headline (the product promise).
    await expect(
      page.getByRole("heading", {
        name: /Important documents, ready when life asks/i,
      }),
    ).toBeVisible();
    // The composed product-story visual carries the readiness narrative.
    await expect(page.getByText(/Your readiness/i).first()).toBeVisible();
    // The trust/credibility additions from earlier work.
    await expect(
      page.getByRole("heading", { name: /The standards behind your documents/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Join the beta/i }).first()).toBeVisible();
  });

  test("login page is reachable and shows the form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
});
