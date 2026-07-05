import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3060",
    headless: true,
  },
  webServer: {
    command: "PORT=3060 npm run dev",
    url: "http://localhost:3060",
    reuseExistingServer: true,
    timeout: 30000,
  },
});