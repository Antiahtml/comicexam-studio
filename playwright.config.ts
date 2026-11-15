import { defineConfig } from "@playwright/test";

/**
 * Prueba end-to-end sobre la versión estática compilada con la subcarpeta de GitHub Pages.
 * Ejecuta antes `npm run build:pages` (lo hace `npm run test:e2e`).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100/comicexam-studio/",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-static.mjs 3100 /comicexam-studio",
    url: "http://127.0.0.1:3100/comicexam-studio/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
