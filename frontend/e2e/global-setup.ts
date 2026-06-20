import { chromium } from "@playwright/test";
import fs from "node:fs";

/**
 * Authenticate once for the whole run.
 *
 * We log in through the real UI (same-origin, so the backend's HttpOnly auth
 * cookies are set exactly as in production) and save the resulting storage
 * state. The `authed` project replays it, so specs start signed in without
 * re-logging in each time. The test user must already exist (CI/local setup
 * seeds it — see e2e/README.md).
 */
async function globalSetup() {
  const base = process.env.E2E_BASE_URL || "http://localhost:3010";
  const username = process.env.E2E_USERNAME || "verify";
  const password = process.env.E2E_PASSWORD || "VerifyPass123!";

  fs.mkdirSync("e2e/.auth", { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    // Let the client hydrate so the React submit handler runs (not a native GET).
    await page.waitForTimeout(1500);
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
      timeout: 30000,
    });
    await page.context().storageState({ path: "e2e/.auth/state.json" });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
