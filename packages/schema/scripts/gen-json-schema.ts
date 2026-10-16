import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { RegionPack } from "../src/region-pack/schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "json-schema/region-pack.schema.json");
const schema = zodToJsonSchema(RegionPack, { name: "RegionPack", $refStrategy: "none" }) as Record<string, unknown>;
schema.$id = "https://github.com/merlinbaptista/home-event-schema/region-pack.schema.json";
schema.title = "Ellie Region Pack";
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
console.log(`Generated ${outputPath}`);
