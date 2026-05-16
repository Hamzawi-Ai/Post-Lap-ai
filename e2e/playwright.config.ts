import { defineConfig, devices } from "@playwright/test";

const NIX_CHROMIUM =
  "/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || NIX_CHROMIUM;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:80",
    trace: "on-first-retry",
    launchOptions: {
      executablePath,
    },
  },
  webServer: {
    command:
      "pnpm --filter @workspace/postlap-ai run dev --port ${PORT:-5173} --host 0.0.0.0",
    url: "http://localhost:80",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
