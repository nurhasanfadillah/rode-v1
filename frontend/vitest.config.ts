import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_URL: "pglite://memory", APP_ENV: "test" },
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
