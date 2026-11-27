import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const authenticated = process.env.HALINA_AUTH_E2E === "true";
const useProductionBuild = authenticated && Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  testMatch: authenticated ? ["staff-auth.spec.ts", "reservation-consistency.spec.ts", "restaurant-review.spec.ts"] : "manager-demo.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: authenticated ? 15_000 : 5_000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `${useProductionBuild ? "npm run build && npm run start" : "npm run dev"} -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/manager`,
    env: {
      ...process.env,
      NEXT_PUBLIC_HALINA_DEMO_MODE: authenticated ? "false" : "true",
    },
    reuseExistingServer: !process.env.CI,
    timeout: useProductionBuild ? 180_000 : 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
