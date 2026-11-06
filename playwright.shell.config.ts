import { defineConfig } from "@playwright/test";

// Public shell checks: run against a configured local app or a preview URL.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "legal-notice.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.SHELL_TEST_URL ?? "http://localhost:3060",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
