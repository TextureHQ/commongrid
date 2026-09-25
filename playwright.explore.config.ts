import { defineConfig } from "@playwright/test";

// Fixture-backed public Explore checks; no database or Clerk sign-in required.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "explore-detail-loading.spec.ts",
  outputDir: process.env.EXPLORE_TEST_OUTPUT ?? "test-results/explore-loading",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.EXPLORE_TEST_URL ?? "http://localhost:3060",
    headless: true,
    navigationTimeout: 120000,
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] }
      : {},
  },
  webServer: {
    command: "PORT=3060 npm run dev",
    url: process.env.EXPLORE_TEST_URL ?? "http://localhost:3060",
    reuseExistingServer: true,
    timeout: 180000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
