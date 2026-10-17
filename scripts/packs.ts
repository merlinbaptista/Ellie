import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonObject = Record<string, unknown>;
interface ReportRow { pack: string; path: string; value: string; used: string; note: string; source: string; decision: string; checked: string }
const root = resolve(process.env.ELLIE_PACKS_ROOT ?? process.cwd());
const packDir = resolve(root, "packages/schema/src/region-packs");
const reportPath = resolve(root, "docs/pack-verification.md");
const demoScriptPath = resolve(root, "demo/script.json");
const jsonFiles = ["default.json", "in.json", "uk.json", "us.json"];
const translationFiles = ["hi.json", "kn.json", "ta.json", "es.json"];
const demoContent = `${await readFile(demoScriptPath, "utf8")}\n${await readFile(resolve(root, "packages/server/src/seed/seed.ts"), "utf8")}`.toLowerCase();
function escaped(value: unknown): string { return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " "); }
function pointer(path: string[]): string { return path.map((part) => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/"); }
function display(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").length > 180 ? `${text!.slice(0, 177)}...` : text ?? "";
}
function likelySource(pack: string, path: string, note: string): string {
  const text = `${path} ${note}`.toLowerCase();
  if (/emergency|safety|1906|112|911/.test(text)) return `${pack} government emergency-services or regulator site`;
  if (/indane|bharat|hp gas|lpg|booking/.test(text)) return "Provider's official booking or customer-support site";
  if (/verified:false|placeholder|starter/.test(note.toLowerCase())) return "Manufacturer manual or relevant official service/provider page";
  return "Manufacturer's official manual or national/regional authority page";
}
function usedInDemo(pack: string, path: string, value: string): string {
  const text = `${path} ${value}`.toLowerCase();
  const demoMarkers = ["lpg_cylinder", "indane", "ro_purifier", "propane_tank", "1906", "911"];
  if (demoMarkers.some((marker) => text.includes(marker) && demoContent.includes(marker))) return "yes";
  if (pack === "IN" && /\/(?:catalog\/(?:lpg_cylinder|ro_purifier)|providers\/indane)(?:\/|$)/.test(path)) return "yes";
  if (pack === "US" && /\/catalog\/propane_tank(?:\/|$)/.test(path)) return "yes";
  return "no";
}
function collect(pack: string, value: unknown, path: string[], rows: ReportRow[]): void {
  if (Array.isArray(value)) { value.forEach((entry, index) => collect(pack, entry, [...path, String(index)], rows)); return; }
  if (!value || typeof value !== "object") return;
  const object = value as JsonObject;
  if (object.verified === false && typeof object.note === "string") {
    const sourcePath = pointer(path);
    const ownerPath = path.at(-1) === "source" ? path.slice(0, -1) : path;
    let owner: unknown = JSON.parse(JSON.stringify(rootJsonByPack.get(pack)));
    for (const segment of ownerPath) owner = (owner as JsonObject)?.[Array.isArray(owner) ? Number(segment) : segment];
    const note = String(object.note);
    const ownerValue = display(owner);
    rows.push({ pack, path: `/${sourcePath}`, value: ownerValue, used: usedInDemo(pack, sourcePath, ownerValue), note, source: likelySource(pack, sourcePath, note), decision: "", checked: "" });
    return;
  }
  for (const [key, child] of Object.entries(object)) collect(pack, child, [...path, key], rows);
}
const rootJsonByPack = new Map<string, unknown>();
const rows: ReportRow[] = [];
for (const file of jsonFiles) {
  const pack = file.replace(/\.json$/, "").toUpperCase();
  const data = JSON.parse(await readFile(resolve(packDir, file), "utf8")) as unknown;
  rootJsonByPack.set(pack, data);
  collect(pack, data, [], rows);
}
for (const file of translationFiles) {
  const path = `packages/ui/src/i18n/${file}`;
  const dictionary = JSON.parse(await readFile(resolve(root, path), "utf8")) as JsonObject;
  rows.push({ pack: "Translations", path, value: display(dictionary), used: "yes", note: "Starter UI translation; native-speaker review is required", source: "Native speaker review of the displayed UI language", decision: "", checked: "" });
}
function markdownTable(items: ReportRow[]): string {
  const header = "| Pack | Path | Value | Used in demo? | Note | Proposed source to check | Decision | Checked by / date |";
  const separator = "|---|---|---|---|---|---|---|---|";
  return [header, separator, ...items.map((row) => `| ${escaped(row.pack)} | ${escaped(row.path)} | ${escaped(row.value)} | ${row.used} | ${escaped(row.note)} | ${escaped(row.source)} | ${row.decision} | ${row.checked} |`)].join("\n");
}

const command = process.argv[2] ?? "report";
if (command === "report") {
  const intro = "# Region Pack Verification\n\nThis report lists unverified regional facts and starter translations. Do not mark a fact verified until a person checks an official source. Use `verify`, `keep-default`, or `remove` in the Decision column. For `verify`, put the checked source URL and reviewer/date in the final column.\n\n";
  await writeFile(reportPath, `${intro}The report lists unique raw-pack source entries (${rows.filter((row) => row.pack !== "Translations").length}); the validator's aggregate can be higher because DEFAULT entries are inherited by regional packs.\n\n${markdownTable(rows)}\n`);
  console.log(`Wrote ${rows.length} rows to docs/pack-verification.md (${rows.filter((row) => row.pack !== "Translations").length} unique raw-pack entries and ${translationFiles.length} translation files).`);
} else if (command === "apply") {
  const report = await readFile(reportPath, "utf8");
  const decisions = new Map<string, { decision: string; checked: string }>();
  for (const line of report.split(/\r?\n/)) {
    if (!line.startsWith("| ") || line.startsWith("| Pack |")) continue;
    const columns = line.split("|").slice(1, -1).map((column) => column.trim().replace(/\\\|/g, "|"));
    if (columns.length < 8) continue;
    decisions.set(`${columns[0]}\0${columns[1]}`, { decision: columns[6] ?? "", checked: columns[7] ?? "" });
  }
  const edits: Array<{ pack: string; file: string; path: string; decision: string }> = [];
  let translationsRemoved = false;
  for (const file of jsonFiles) {
    const pack = file.replace(/\.json$/, "").toUpperCase();
    const data = JSON.parse(await readFile(resolve(packDir, file), "utf8")) as unknown;
    function visit(node: unknown, path: string[]): unknown {
      if (Array.isArray(node)) return node.map((entry, index) => visit(entry, [...path, String(index)])).filter((entry) => entry !== REMOVE);
      if (!node || typeof node !== "object") return node;
      const object = node as JsonObject;
      if (object.verified === false && typeof object.note === "string") {
        const sourcePath = `/${pointer(path)}`;
        const row = decisions.get(`${pack}\0${sourcePath}`);
        if (row?.decision === "keep-default" || !row?.decision) return object;
        if (row.decision === "verify") {
          const url = row.checked.match(/https?:\/\/\S+/)?.[0];
          const checkedOn = row.checked.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
          if (!url || !checkedOn) throw new Error(`Verified row needs a checked URL and YYYY-MM-DD date: ${pack} ${sourcePath}`);
          edits.push({ pack, file, path: sourcePath, decision: "verify" });
          return { ...object, url, checkedOn, verified: true };
        }
        if (row.decision === "remove") {
          edits.push({ pack, file, path: sourcePath, decision: "remove" });
          return REMOVE;
        }
        throw new Error(`Unknown decision '${row.decision}' for ${pack} ${sourcePath}`);
      }
      for (const [key, child] of Object.entries(object)) {
        const updated = visit(child, [...path, key]);
        if (updated === REMOVE) {
          if (key === "source") return REMOVE;
          delete object[key];
        } else object[key] = updated;
      }
      return object;
    }
    const REMOVE = Symbol("remove");
    const updated = visit(data, []);
    const removedProviders = edits.filter((edit) => edit.pack === pack && edit.decision === "remove").map((edit) => edit.path.match(/^\/providers\/([^/]+)\/source$/)?.[1]).filter((value): value is string => Boolean(value));
    if (updated && typeof updated === "object") {
      const rootRecord = updated as JsonObject;
      const catalog = rootRecord.catalog as JsonObject | undefined;
      for (const entry of Object.values(catalog ?? {})) {
        if (entry && typeof entry === "object" && removedProviders.includes(String((entry as JsonObject).defaultProviderKey))) delete (entry as JsonObject).defaultProviderKey;
      }
    }
    const output = `${JSON.stringify(updated, null, 2)}\n`;
    const original = await readFile(resolve(packDir, file), "utf8");
    if (output !== original) await writeFile(resolve(packDir, file), output);
  }
  const keptTranslations: string[] = ["en"];
  for (const file of translationFiles) {
    const path = `packages/ui/src/i18n/${file}`;
    const row = decisions.get(`Translations\0${path}`);
    if (row?.decision === "remove") {
      await rm(resolve(root, path), { force: true });
      translationsRemoved = true;
      continue;
    }
    keptTranslations.push(file.replace(/\.json$/, ""));
    if (row?.decision === "verify") {
      const checkedOn = row.checked.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
      const reviewer = row.checked.replace(/\b\d{4}-\d{2}-\d{2}\b/, "").replace(/^(checked by:?\s*)/i, "").trim();
      if (!reviewer || !checkedOn) throw new Error(`Native-speaker verification needs reviewer and YYYY-MM-DD: ${path}`);
      const dictionaryPath = resolve(root, path);
      const dictionary = JSON.parse(await readFile(dictionaryPath, "utf8")) as JsonObject;
      const meta = dictionary._meta && typeof dictionary._meta === "object" ? dictionary._meta as JsonObject : {};
      dictionary._meta = { ...meta, reviewed: true, reviewedBy: reviewer, checkedOn };
      await writeFile(dictionaryPath, `${JSON.stringify(dictionary, null, 2)}\n`);
    } else if (row?.decision && row.decision !== "keep-default") throw new Error(`Unknown translation decision '${row.decision}' for ${path}`);
  }
  if (translationsRemoved) {
    const imports = keptTranslations.map((language) => `import ${language} from "./${language}.json";`);
    const localeLines = [
      ...imports,
      "",
      `const dictionaries = { ${keptTranslations.join(", ")} } as const;`,
      "export type UiLanguage = keyof typeof dictionaries;",
      "export type TranslationKey = keyof typeof en;",
      "",
      "export function uiLanguage(tag?: string): UiLanguage {",
      "  const key = tag?.split(\"-\")[0]?.toLowerCase() as UiLanguage | undefined;",
      "  return key && key in dictionaries ? key : \"en\";",
      "}",
      "export function t(key: TranslationKey, language: UiLanguage, vars: Record<string, string | number> = {}): string {",
      "  const dictionary = dictionaries[language] as Record<string, string>;",
      "  const fallback = en[key];",
      "  let value = dictionary[key] ?? fallback;",
      "  if (!dictionary[key] && language !== \"en\" && import.meta.env?.DEV) console.warn(`Missing ${language} translation: ${key}`);",
      "  for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));",
      "  return value;",
      "}",
      "export function formatDate(value: string, languageTag: string, options: Intl.DateTimeFormatOptions = { dateStyle: \"medium\" }): string {",
      "  return new Intl.DateTimeFormat(languageTag, options).format(new Date(value));",
      "}",
      "export function translationDictionaries() { return dictionaries; }",
      "",
    ];
    const localeIndex = localeLines.join("\n");
    await writeFile(resolve(root, "packages/ui/src/i18n/index.ts"), localeIndex);
  }
  for (const row of decisions.values()) if (!/^(|verify|keep-default|remove)$/.test(row.decision)) throw new Error(`Unknown decision: ${row.decision}`);
  console.log(`Applied ${edits.length} decision(s). Review the diff, then run npm run validate:packs.`);
  for (const edit of edits) console.log(`${edit.decision}: ${edit.pack} ${edit.path}`);
} else throw new Error("Usage: tsx scripts/packs.ts report|apply");
