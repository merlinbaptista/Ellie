import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRegionRegistry } from "@ellie/schema";

const root = resolve(process.cwd(), "../..");
const cli = resolve(root, "node_modules/tsx/dist/cli.mjs");
const packTool = resolve(root, "scripts/packs.ts");

describe("pack verification report", () => {
  it("generates complete rows and applies verify, keep-default, and safe optional-provider removal decisions", () => {
    const temp = mkdtempSync(join(tmpdir(), "ellie-packs-report-"));
    try {
      for (const directory of ["packages/schema/src/region-packs", "packages/ui/src/i18n", "packages/server/src/seed", "demo", "docs"]) mkdirSync(join(temp, directory), { recursive: true });
      for (const name of ["default.json", "in.json", "uk.json", "us.json"]) cpSync(join(root, "packages/schema/src/region-packs", name), join(temp, "packages/schema/src/region-packs", name));
      for (const name of ["hi.json", "kn.json", "ta.json", "es.json"]) cpSync(join(root, "packages/ui/src/i18n", name), join(temp, "packages/ui/src/i18n", name));
      cpSync(join(root, "packages/server/src/seed/seed.ts"), join(temp, "packages/server/src/seed/seed.ts"));
      cpSync(join(root, "demo/script.json"), join(temp, "demo/script.json"));
      const env = { ...process.env, ELLIE_PACKS_ROOT: temp };
      execFileSync(process.execPath, [cli, packTool, "report"], { cwd: root, env, stdio: "pipe" });
      const reportPath = join(temp, "docs/pack-verification.md");
      const lines = readFileSync(reportPath, "utf8").split(/\r?\n/);
      const table = lines.filter((line) => line.startsWith("| ") && !line.startsWith("| Pack |") && !line.startsWith("|---"));
      expect(table.length).toBeGreaterThan(50);
      expect(table.some((line) => line.includes("/catalog/lpg_cylinder/recurring/source") && line.includes("| yes |"))).toBe(true);
      expect(table.filter((line) => line.includes("| Translations |")).length).toBe(4);

      const verify = lines.findIndex((line) => line.startsWith("| DEFAULT | /sources/0 |"));
      const remove = lines.findIndex((line) => line.startsWith("| US | /providers/filter_shop/source |"));
      const keep = lines.findIndex((line) => line.startsWith("| UK | /sources/0 |"));
      const translation = lines.findIndex((line) => line.startsWith("| Translations | packages/ui/src/i18n/kn.json |"));
      expect(verify).toBeGreaterThanOrEqual(0); expect(remove).toBeGreaterThanOrEqual(0); expect(keep).toBeGreaterThanOrEqual(0); expect(translation).toBeGreaterThanOrEqual(0);
      const update = (index: number, decision: string, checked: string) => {
        const columns = lines[index]!.split("|");
        columns[7] = ` ${decision} `; columns[8] = ` ${checked} `;
        lines[index] = columns.join("|");
      };
      update(verify, "verify", "https://official.example/fact Checked by: Reviewer 2026-10-17");
      update(remove, "remove", "");
      update(keep, "keep-default", "");
      update(translation, "verify", "Native reviewer 2026-10-17");
      writeFileSync(reportPath, `${lines.join("\n")}\n`);
      execFileSync(process.execPath, [cli, packTool, "apply"], { cwd: root, env, stdio: "pipe" });

      const packs = ["default", "in", "uk", "us"].map((name) => JSON.parse(readFileSync(join(temp, `packages/schema/src/region-packs/${name}.json`), "utf8")));
      expect(packs[0].sources[0]).toMatchObject({ verified: true, url: "https://official.example/fact", checkedOn: "2026-10-17" });
      expect(packs[3].providers.filter_shop).toBeUndefined();
      expect(packs[3].catalog.hvac_filter.defaultProviderKey).toBeUndefined();
      const kannada = JSON.parse(readFileSync(join(temp, "packages/ui/src/i18n/kn.json"), "utf8"));
      expect(kannada._meta).toMatchObject({ reviewed: true, reviewedBy: "Native reviewer", checkedOn: "2026-10-17" });
      createRegionRegistry(packs);
      expect(existsSync(join(temp, "docs/pack-verification.md"))).toBe(true);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
