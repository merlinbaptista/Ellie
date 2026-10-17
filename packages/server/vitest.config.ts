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
  },
});
