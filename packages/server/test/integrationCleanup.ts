import { afterAll } from "vitest";
import type { Server } from "node:http";
import type { AppContext } from "../src/context.js";
import { closeAllSessions } from "../src/mcp/transport.js";

type Cleanup = () => Promise<void>;
const cleanups: Cleanup[] = [];
let installed = false;

export function registerIntegrationCleanup(server: Server, ctx: AppContext): void {
  cleanups.push(async () => {
    const scheduler = ctx.scheduler as typeof ctx.scheduler & { close?: () => void };
    scheduler.close?.();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  if (installed) return;
  installed = true;
  afterAll(async () => {
    await closeAllSessions();
    const pending = cleanups.splice(0);
    const results = await Promise.allSettled(pending.map((cleanup) => cleanup()));
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) throw rejected.reason;
  });
}
