import path from "node:path";
import { defineConfig } from "vitest/config";

const testData = path.resolve(__dirname, "test-data.nosync/unit");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globalSetup: ["tests/unit/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      DATA_DIR: testData,
      DATABASE_URL: `file:${path.join(testData, "test.db")}`,
    },
  },
});
