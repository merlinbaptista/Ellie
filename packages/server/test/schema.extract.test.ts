import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

describe("schema extraction", () => {
  it("omits phone/simulator modules and excluded imports from the standalone tree", () => {
    const parent = mkdtempSync(join(tmpdir(), "ellie-schema-extract-"));
    const output = join(parent, "schema");
    try {
      execFileSync(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), "scripts/schema-extract.ts", "--out", output], { cwd: root, stdio: "pipe" });
      symlinkSync(resolve(root, "node_modules"), join(output, "node_modules"), process.platform === "win32" ? "junction" : "dir");
      expect(readdirSync(join(output, "src"))).not.toContain("phone.ts");
      expect(readdirSync(join(output, "src"))).not.toContain("sim.ts");
      expect(readdirSync(join(output, "test"))).not.toContain("phone.test.ts");
      for (const file of readdirSync(join(output, "src"), { recursive: true }) as string[]) {
        if (!file.endsWith(".ts")) continue;
        const content = readFileSync(join(output, "src", file), "utf8");
        expect(content).not.toMatch(/from\s+["'][^"']*\/(?:phone|sim)\.js["']/);
      }
      execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", resolve(output, "tsconfig.json"), "--noEmit"], { cwd: root, stdio: "pipe" });
      execFileSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "--root", output], { cwd: root, stdio: "pipe" });
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });
});
