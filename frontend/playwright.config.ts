import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the CertaNest frontend.
 *
 * These drive the real app in a browser, so they need a running stack:
 *   - the Next.js frontend (same-origin proxy mode), and
 *   - the Django backend it proxies to,
 * with a seeded test user. See `e2e/README.md` for the one-command local run.
 *
 * `E2E_BASE_URL` points at the running frontend (default :3010). Auth is handled
 * once in `global-setup` (a real login → saved storage state) and reused by the
 * `authed` project, so individual specs never re-login.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3010";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authed",
      testMatch: /.*\.authed\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
    },
  ],
});
