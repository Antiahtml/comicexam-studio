import { defineConfig } from "@playwright/test";

/** Prueba end-to-end. Ejecuta antes `npm run build` (lo hace `npm run test:e2e`). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3100/api/projects",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
  },
});
