import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_REGION_PACKS, RegionPack, createRegionRegistry, type RegionRegistry } from "@ellie/schema";
import type { Logger } from "pino";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

export async function createServerRegionRegistry(logger: Logger, packsDirectory?: string): Promise<RegionRegistry> {
  let accepted = [...BUILTIN_REGION_PACKS];
  if (packsDirectory) {
    const directory = isAbsolute(packsDirectory) ? packsDirectory : resolve(repoRoot, packsDirectory);
    let names: string[] = [];
    try {
      names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".json")).sort();
    } catch (error) {
      logger.warn({ err: error, directory }, "Could not read extra region packs directory");
    }
    for (const name of names) {
      const file = resolve(directory, name);
      try {
        const value: unknown = JSON.parse(await readFile(file, "utf8"));
        const parsed = RegionPack.parse(value);
        createRegionRegistry([...accepted, parsed]);
        accepted = [...accepted, parsed];
        logger.info({ packId: parsed.packId, file }, "Loaded extra region pack");
      } catch (error) {
        logger.warn({ err: error, file }, "Skipping invalid extra region pack");
      }
    }
  }
  const registry = createRegionRegistry(accepted);
  logger.info({ packs: registry.list().map(({ packId, version }) => `${packId} ${version}`) }, "Loaded region packs");
  return registry;
}
