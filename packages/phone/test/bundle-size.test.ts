import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(resolve(directory, entry.name)) : Promise.resolve([resolve(directory, entry.name)])));
  return nested.flat();
}
describe("phone bundle budget", () => {
  it("keeps generated JavaScript below 120 KB gzipped when a build exists", async () => {
    const dist = resolve(import.meta.dirname, "../dist");
    const generated = await files(dist).catch(() => []);
    const scripts = generated.filter((path) => path.endsWith(".js"));
    if (!scripts.length) return;
    const sizes = await Promise.all(scripts.map(async (path) => gzipSync(await readFile(path)).byteLength));
    const bytes = sizes.reduce((sum, size) => sum + size, 0);
    expect(bytes).toBeLessThanOrEqual(120 * 1024);
  });
});
