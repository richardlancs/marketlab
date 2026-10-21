import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (e2e/): the real app in a real browser, both services
 * running (scripts/e2e-serve.mjs) on the mock market, with a fresh database.
 *
 *   npm run build && npm run test:e2e
 *
 * Locally they use the installed Chrome; in CI, Playwright's own Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3010",
    trace: "retain-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  projects: [
    { name: "chromium", testIgnore: /mobile\.spec/, use: { ...devices["Desktop Chrome"], ...(process.env.CI ? {} : { channel: "chrome" }) } },
    // An iPhone-sized screen, in Chromium (e2e/mobile.spec.ts).
    {
      name: "phone",
      testMatch: /mobile\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ...(process.env.CI ? {} : { channel: "chrome" }) },
    },
  ],
  webServer: {
    command: "node scripts/e2e-serve.mjs",
    url: "http://localhost:3010",
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
});
