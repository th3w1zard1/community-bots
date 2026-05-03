import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const packageRoot = dirname(fileURLToPath(import.meta.url));

const nakamaHost = process.env.VITE_NAKAMA_HOST ?? "127.0.0.1";
const nakamaPort = process.env.VITE_NAKAMA_PORT ?? "7350";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
    cwd: packageRoot,
    env: {
      ...process.env,
      VITE_PAZAAK_BACKEND: "nakama",
      VITE_NAKAMA_HOST: nakamaHost,
      VITE_NAKAMA_PORT: nakamaPort,
    },
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
