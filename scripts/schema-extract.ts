import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();
const argument = process.argv.indexOf("--out");
if (argument < 0 || !process.argv[argument + 1]) throw new Error("Usage: npm run schema:extract -- --out <directory>");
const output = resolve(root, process.argv[argument + 1]!);
const force = process.argv.includes("--force");
if (output === root || output.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Extraction output must be outside the Headsup repository.");
try {
  const existing = await readdir(output);
  if (existing.length && !force) throw new Error(`Refusing to overwrite non-empty output directory: ${output} (pass --force to replace it)`);
  if (existing.length && force) await rm(output, { recursive: true, force: true });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const sourceRoot = resolve(root, "packages/schema");
await mkdir(output, { recursive: true });
await cp(resolve(sourceRoot, "src"), resolve(output, "src"), { recursive: true });
await rm(resolve(output, "src/phone.ts"), { force: true });
await rm(resolve(output, "src/sim.ts"), { force: true });
await cp(resolve(sourceRoot, "json-schema"), resolve(output, "json-schema"), { recursive: true });
await cp(resolve(sourceRoot, "scripts"), resolve(output, "scripts"), { recursive: true });
for (const file of ["LICENSE", "CHANGELOG.md"]) await cp(resolve(sourceRoot, file), resolve(output, file));
const testOut = resolve(output, "test");
await mkdir(testOut, { recursive: true });
for (const file of await readdir(resolve(sourceRoot, "test"))) {
  if (["contracts.test.ts", "phone.test.ts", "generic-contracts.test.ts"].includes(file)) continue;
  await cp(resolve(sourceRoot, "test", file), resolve(testOut, file));
}
await writeFile(resolve(testOut, "contracts.test.ts"), `import { describe, expect, it } from "vitest";\nimport { ToolContracts } from "../src/contracts.js";\ndescribe("generic contracts", () => { it("exports only shared home-event inputs", () => { expect(Object.keys(ToolContracts).sort()).toEqual(["diagnose", "due_this_week", "get_history", "log_event", "log_resolution", "predict_next", "setup_household"]); expect(ToolContracts.log_event.safeParse({ item: "gas", type: "changed" }).success).toBe(true); }); });\n`);
await cp(resolve(sourceRoot, "vitest.config.ts"), resolve(output, "vitest.config.ts"));

const packageJson = {
  name: "home-event-schema",
  version: "1.0.0",
  description: "Open, browser-safe schemas and region packs for household maintenance events.",
  license: "MIT",
  type: "module",
  sideEffects: false,
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./region-packs/*.json": "./dist/region-packs/*.json", "./json-schema/region-pack.schema.json": "./json-schema/region-pack.schema.json" },
  files: ["dist", "json-schema", "README.md", "LICENSE", "CHANGELOG.md"],
  scripts: { build: "tsc -p tsconfig.json", typecheck: "tsc -p tsconfig.json --noEmit", test: "vitest run", "gen:jsonschema": "tsx scripts/gen-json-schema.ts", "validate:packs": "tsx scripts/validate-packs.ts" },
  dependencies: { zod: "^3.25" },
  devDependencies: { "zod-to-json-schema": "^3", vitest: "^2", tsx: "^4", typescript: "^5.6", "@types/node": "^22", "@vitest/coverage-v8": "^2" },
  keywords: ["home", "household", "maintenance", "schema", "region-pack"],
};
await writeFile(resolve(output, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(resolve(output, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", declaration: true, strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: true, outDir: "dist", rootDir: "." }, include: ["src/**/*.ts", "scripts/**/*.ts"] }, null, 2) + "\n");
const genericContracts = `import { z } from "zod";
import { EventSource, EventType } from "./enums.js";
import { zHouseholdId } from "./primitives.js";
const householdId = zHouseholdId.optional().describe("Household identifier, if already known");
const item = z.string().describe("What the user called the household item");
const schemas = {
  setup_household: z.object({ householdId, displayName: z.string().max(60).optional().describe("A short name for the home"), country: z.string().length(2).optional().describe("Two-letter country code"), region: z.string().max(80).optional().describe("City or postcode only"), timeZone: z.string().optional().describe("Household IANA time zone"), language: z.string().optional().describe("Spoken language tag"), phoneLanguage: z.string().optional().describe("Phone page language tag"), phone: z.string().optional().describe("Phone number, only with consent"), email: z.string().email().optional().describe("Email address, only with consent"), consent: z.boolean().optional().describe("Whether the person consents to saving contact details"), confirm: z.boolean().optional().describe("Whether the suggested country was confirmed") }).strict(),
  log_event: z.object({ householdId, item, type: EventType.describe("What happened"), source: EventSource.optional().describe("Event source"), component: z.string().optional().describe("Item component"), when: z.string().optional().describe("When it happened"), previousWhen: z.string().optional().describe("When the previous event occurred"), itemName: z.string().max(60).optional().describe("A household item nickname"), brand: z.string().max(60).optional().describe("Brand"), model: z.string().max(60).optional().describe("Model"), purchaseDate: z.string().optional().describe("Purchase date"), warrantyUntil: z.string().optional().describe("Warranty expiry"), requestId: z.string().max(64).optional().describe("Idempotency key"), notes: z.string().max(500).optional().describe("Additional details"), cost: z.number().nonnegative().optional().describe("Amount spent"), symptom: z.string().optional().describe("Reported symptom"), providerKey: z.string().optional().describe("Provider identifier"), provider: z.string().max(120).optional().describe("Named supplier") }).strict(),
  get_history: z.object({ householdId, item: item.optional().describe("Limit history to one item"), period: z.enum(["30d", "90d", "1y", "all"]).default("1y").describe("History period"), types: z.array(EventType).optional().describe("Event types to include") }).strict(),
  predict_next: z.object({ householdId, item, component: z.string().optional().describe("Specific item part") }).strict(),
  diagnose: z.object({ householdId, item, symptom: z.string().describe("Reported problem"), diagnosisId: z.string().optional().describe("Existing diagnosis session"), answer: z.string().optional().describe("Answer to one question"), answers: z.record(z.string(), z.string()).optional().describe("Answers already supplied") }).strict(),
  log_resolution: z.object({ householdId, item, diagnosisId: z.string().optional().describe("Diagnosis session"), causeKey: z.string().optional().describe("Confirmed cause key"), component: z.string().optional().describe("Fixed component"), cause: z.string().max(200).optional().describe("Confirmed cause"), fix: z.string().max(500).optional().describe("What fixed the issue"), byWhom: z.enum(["self", "technician", "warranty_service"]).optional().describe("Who fixed it"), when: z.string().optional().describe("When it was fixed"), cost: z.number().nonnegative().optional().describe("Fix cost") }).strict(),
  due_this_week: z.object({ householdId, days: z.number().int().min(1).max(31).default(7).describe("Days to look ahead"), includeOk: z.boolean().default(false).describe("Include items not due soon") }).strict(),
} as const;
export type SetupHouseholdInput = z.infer<typeof schemas.setup_household>;
export type LogEventInput = z.infer<typeof schemas.log_event>;
export type GetHistoryInput = z.infer<typeof schemas.get_history>;
export type PredictNextInput = z.infer<typeof schemas.predict_next>;
export type DiagnoseInput = z.infer<typeof schemas.diagnose>;
export type LogResolutionInput = z.infer<typeof schemas.log_resolution>;
export type DueThisWeekInput = z.infer<typeof schemas.due_this_week>;
export const ToolContracts = schemas;
export const ToolContractShapes = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, schema.shape]));
`;
await writeFile(resolve(output, "src/contracts.ts"), genericContracts);
const index = `export { SCHEMA_VERSION } from "./version.js";
export * from "./primitives.js";
export * from "./enums.js";
export * from "./household.js";
export * from "./item.js";
export * from "./event.js";
export * from "./prediction.js";
export * from "./resolution.js";
export * from "./diagnosis.js";
export * from "./privacy.js";
export * from "./contracts.js";
export * from "./region-pack/schema.js";
export * from "./region-pack/merge.js";
export * from "./region-pack/registry.js";
export * from "./region-pack/builtins.js";
export * from "./catalog/match.js";
export * from "./utils/ids.js";
export * from "./utils/dates.js";
export * from "./utils/units.js";
export * from "./utils/format.js";
`;
await writeFile(resolve(output, "src/index.ts"), index);

const readme = await readFile(resolve(sourceRoot, "README.md"), "utf8");
await writeFile(resolve(output, "README.md"), `${readme}\n\n## Release sync\n\nEllie currently maintains the monorepo schema as its source of truth. The standalone repository is regenerated with npm run schema:extract for each release.\n`);
await writeFile(resolve(output, "CONTRIBUTING.md"), `# Contributing\n\nContributions to schemas and region packs should include tests and provenance. Never add personal household data or mark a fact verified without checking its official source.\n\nRun npm test, npm run typecheck, npm run validate:packs, and npm run gen:jsonschema before opening a pull request.\n`);
await writeFile(resolve(output, "CODE_OF_CONDUCT.md"), `# Code of Conduct\n\nThis project follows the Contributor Covenant Code of Conduct, version 2.1. The canonical text is at https://www.contributor-covenant.org/version/2/1/code_of_conduct/.\n`);
await writeFile(resolve(output, "SECURITY.md"), `# Security Policy\n\nPlease report security vulnerabilities privately to the repository maintainers. Do not include household personal data in an issue.\n`);
await writeFile(resolve(output, "CHANGELOG.md"), `# Changelog\n\n## 1.0.0\n\nInitial standalone release extracted from Headsup schema 1.7.0.\n`);
await mkdir(resolve(output, ".github/workflows"), { recursive: true });
const matrixExpression = "${{ matrix.node }}";
await writeFile(resolve(output, ".github/workflows/ci.yml"), ["name: CI", "on:", "  push:", "  pull_request:", "jobs:", "  test:", "    runs-on: ubuntu-latest", "    strategy:", "      matrix:", "        node: [20, 22]", "    steps:", "      - uses: actions/checkout@v4", "      - uses: actions/setup-node@v4", "        with:", `          node-version: ${matrixExpression}`, "          cache: npm", "      - run: npm install", "      - run: npm run typecheck", "      - run: npm test", "      - run: npm run validate:packs", "      - run: npm run gen:jsonschema", "      - run: git diff --exit-code", ""].join("\n"));
await mkdir(resolve(output, ".github/ISSUE_TEMPLATE"), { recursive: true });
await writeFile(resolve(output, ".github/ISSUE_TEMPLATE/new-region.yml"), `name: New region pack\ndescription: Propose sourced catalog and safety data for a new region\nbody:\n  - type: input\n    id: country\n    attributes:\n      label: Country code\n      description: ISO 3166-1 alpha-2\n    validations:\n      required: true\n  - type: textarea\n    id: items\n    attributes:\n      label: Items and recurring facts\n      description: Include sources for each fact\n    validations:\n      required: true\n  - type: textarea\n    id: providers\n    attributes:\n      label: Providers and booking channels\n      description: Include official source URLs\n  - type: textarea\n    id: emergency\n    attributes:\n      label: Emergency numbers and safety guidance\n      description: Include official source URLs\n    validations:\n      required: true\n`);
await mkdir(resolve(output, "examples"), { recursive: true });
await writeFile(resolve(output, "examples/node.mjs"), `import { createBuiltInRegistry } from "home-event-schema";\nconst regions = createBuiltInRegistry();\nconsole.log(regions.forCountry("IN").catalog.lpg_cylinder.displayName);\n`);
await writeFile(resolve(output, "examples/browser.html"), `<!doctype html><meta charset="utf-8"><title>home-event-schema browser example</title><pre id="result"></pre><script type="module">import { createBuiltInRegistry } from "../dist/index.js"; document.querySelector("#result").textContent = createBuiltInRegistry().forCountry("IN").name;</script>\n`);

const excludedImport = /from\s+["'][^"']*\/(?:phone|sim)\.js["']/;
for (const folder of ["src", "test"]) {
  const walk = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(async (entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  };
  for (const file of await walk(resolve(output, folder))) {
    if (!file.endsWith(".ts")) continue;
    const content = await readFile(file, "utf8");
    if (excludedImport.test(content)) throw new Error(`Excluded phone/simulator import found in ${file}`);
  }
}
console.log(`Extracted home-event-schema 1.0.0 to ${output}`);
