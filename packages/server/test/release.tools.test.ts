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

  it("separates code problems from credential gaps without including secret values", () => {
    const secret = "not-for-output-".padEnd(40, "x");
    const checks = staticPreflight({
      NODE_ENV: "production", LINK_SIGNING_SECRET: secret, ELLIE_PUBLIC_BASE_URL: "http://example.test", HOST: "0.0.0.0", ELLIE_DOCKER: "true",
      SIMULATOR_ENABLED: true, SIM_ACCESS_CODE: "short", CORS_ORIGINS: ["http://localhost:5173"], ELLIE_FAKE_NOW: "2026-10-16T03:30:00.000Z", OAUTH_ENABLED: false,
      STORAGE_DRIVER: "aws", LLM_DRIVER: "mock", NOTIFY_DRIVER: "aws", SCHEDULER_DRIVER: "aws",
    });
    expect(summarizePreflight(checks)).toEqual({ passed: true, codeProblems: 0, credentialGaps: 3, warnings: 3 });
    expect(checks.filter((check) => check.kind === "CREDENTIAL" && check.status !== "PASS").map((check) => check.label)).toEqual(["Public base URL", "Simulator gate", "LLM driver"]);
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("reports an unrecognised driver mode as a code problem", () => {
    const checks = staticPreflight({
      NODE_ENV: "production", LINK_SIGNING_SECRET: "a".repeat(40), ELLIE_PUBLIC_BASE_URL: "https://ellie.example", HOST: "127.0.0.1",
      SIMULATOR_ENABLED: false, CORS_ORIGINS: ["https://ellie.example"], OAUTH_ENABLED: true,
      STORAGE_DRIVER: "typo", LLM_DRIVER: "aws", NOTIFY_DRIVER: "aws", SCHEDULER_DRIVER: "aws",
    });
    const summary = summarizePreflight(checks);
    expect(summary).toMatchObject({ passed: false, codeProblems: 1, credentialGaps: 0 });
    expect(checks.find((check) => check.label === "Storage driver")).toMatchObject({ kind: "CODE", status: "FAIL" });
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
