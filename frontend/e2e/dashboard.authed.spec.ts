import { expect, test } from "@playwright/test";

// These run with the saved auth state from global-setup.
test.describe("Authenticated dashboard", () => {
  test("documents vault loads (Folders is the default view)", async ({ page }) => {
    await page.goto("/dashboard/documents");
    await expect(
      page.getByRole("heading", { name: /Document vault/i }),
    ).toBeVisible({ timeout: 30000 });
  });

  test("file inbox loads", async ({ page }) => {
    await page.goto("/dashboard/files");
    await expect(
      page.getByRole("heading", { name: /Files waiting to be organized/i }),
    ).toBeVisible({ timeout: 30000 });
  });
});
