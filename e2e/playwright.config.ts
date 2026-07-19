import { defineConfig, devices } from "@playwright/test";

// Prefer localhost over 127.0.0.1 — Next.js 16 blocks cross-origin
// /_next/* from 127.0.0.1 unless allowedDevOrigins is set.
const webBase = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";
const apiBase = process.env.E2E_API_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: webBase,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ru-RU",
    extraHTTPHeaders: {
      "Accept-Language": "ru"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  metadata: {
    apiBase
  }
});
