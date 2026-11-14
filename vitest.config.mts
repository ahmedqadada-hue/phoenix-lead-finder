import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: process.env.LIVE_TESTS ? ["tests/live/**/*.test.ts"] : ["tests/*.test.ts"],
    globalSetup: process.env.LIVE_TESTS ? [] : ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://phoenix:phoenix@localhost:5432/phoenix_test",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  },
});
