import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";
import { registerIntegrationCleanup } from "./integrationCleanup.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe.sequential("demo checker integration", () => {
  it("passes every step against an in-process server using the real simulator and phone APIs", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    registerIntegrationCleanup(server, ctx);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    ctx.env.ELLIE_PUBLIC_BASE_URL = base;
    const child = spawn(process.execPath, [resolve(repositoryRoot, "node_modules/tsx/dist/cli.mjs"), "scripts/demo-check.ts"], {
      cwd: repositoryRoot,
      env: { ...process.env, ELLIE_DEMO_URL: base },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    const [code] = await once(child, "close") as [number | null];
    expect(code, `${stdout}\n${stderr}`).toBe(0);
    expect(stdout).toContain("'cleanup-reseed'");
    expect(stdout).not.toContain("✖");
  }, 45_000);
});
