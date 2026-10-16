import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@ellie/schema": fileURLToPath(new URL("../schema/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    testTimeout: 10_000,
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/**/*.integration.test.ts", "test/journey*.test.ts", "test/dueThisWeek.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/**/*.integration.test.ts", "test/journey*.test.ts", "test/dueThisWeek.test.ts"],
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
});
