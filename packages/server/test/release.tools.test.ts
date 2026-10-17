import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { staticPreflight, summarizePreflight } from "../../../scripts/preflight-lib.js";
import { eraseThrowawayHousehold, percentile } from "../../../scripts/bench-lib.js";

const root = resolve(process.cwd(), "../..");

describe("release tooling", () => {
  it("lists unverified pack facts and all starter translation files", async () => {
    const report = await readFile(resolve(root, "docs/pack-verification.md"), "utf8");
    expect(report).toMatch(/\| IN\s+\| \/catalog\/lpg_cylinder\/recurring\/source\s+\|/);
    expect(report).toMatch(/\| Translations\s+\| packages\/ui\/src\/i18n\/kn\.json\s+\|/);
    expect(report).toMatch(/\| IN\s+\| \/catalog\/lpg_cylinder\/recurring\/source\s+\|.*\| yes\s+\|/);
    expect(report.match(/\| Translations \|/g)).toHaveLength(4);
    expect(report).toContain("DEFAULT entries are inherited");
  });

  it("reports production failures and warnings without including secret values", () => {
    const secret = "not-for-output-".padEnd(40, "x");
    const checks = staticPreflight({
      NODE_ENV: "production", LINK_SIGNING_SECRET: secret, ELLIE_PUBLIC_BASE_URL: "http://example.test", HOST: "0.0.0.0", ELLIE_DOCKER: "true",
      SIMULATOR_ENABLED: true, SIM_ACCESS_CODE: "short", CORS_ORIGINS: ["http://localhost:5173"], ELLIE_FAKE_NOW: "2026-10-16T03:30:00.000Z", OAUTH_ENABLED: false,
      STORAGE_DRIVER: "aws", LLM_DRIVER: "mock", NOTIFY_DRIVER: "aws", SCHEDULER_DRIVER: "aws",
    });
    expect(summarizePreflight(checks)).toEqual({ passed: false, failures: 2, warnings: 3 });
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("calculates nearest-rank percentiles", () => {
    expect(percentile([8, 1, 4, 2, 9], 50)).toBe(4);
    expect(percentile([8, 1, 4, 2, 9], 95)).toBe(9);
    expect(() => percentile([], 95)).toThrow();
  });

  it("erases the temporary benchmark household through the required spoken-code flow", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    await eraseThrowawayHousehold("hh_bench-12345678", async (name, args) => {
      calls.push({ name, args });
      return calls.length === 1
        ? { structuredContent: { speech: "To confirm, say: forget everything, blue river.", followUp: { retry: { args: { householdId: "hh_bench-12345678", confirmationId: "confirm-1" } } } } }
        : { structuredContent: { speech: "Everything is erased." } };
    });
    expect(calls.map((call) => call.name)).toEqual(["forget_household", "forget_household"]);
    expect(calls[1]?.args).toMatchObject({ householdId: "hh_bench-12345678", confirmationId: "confirm-1", confirmationCode: "blue river" });
  });
});
