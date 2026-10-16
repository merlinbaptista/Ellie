import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
async function files(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : Promise.resolve([resolve(directory, entry.name)])))).flat(); }
describe("simulator bundle budget", () => {
  it("keeps generated JavaScript under 200 KB gzipped when built", async () => {
    const generated = await files(resolve(import.meta.dirname, "../dist")).catch(() => []);
    const scripts = generated.filter((path) => path.endsWith(".js"));
    if (!scripts.length) return;
    const bytes = (await Promise.all(scripts.map(async (path) => gzipSync(await readFile(path)).byteLength))).reduce((sum, size) => sum + size, 0);
    expect(bytes).toBeLessThanOrEqual(200 * 1024);
  });
});
