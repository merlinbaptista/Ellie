import { defineWorkspace } from "vitest/config";

// Vitest 2 ignores `test.projects`; a workspace file is the supported way to split and serialise suites.
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      include: ["test/**/*.test.ts"],
      exclude: ["test/**/*.integration.test.ts", "test/journey*.test.ts", "test/dueThisWeek.test.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      include: ["test/**/*.integration.test.ts", "test/journey*.test.ts", "test/dueThisWeek.test.ts"],
      testTimeout: 15_000,
      poolOptions: { forks: { singleFork: true }, threads: { singleThread: true } },
    },
  },
]);
