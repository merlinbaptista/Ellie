import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

const servers: Array<{ close: () => void }> = [];
afterEach(async () => { await closeAllSessions(); for (const server of servers.splice(0)) server.close(); });

describe("diagnosis Journey 2", () => {
  it("diagnoses the overdue filter with cited history, logs the fix, and stops for gas safety", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const server = createApp(ctx).listen(0, "127.0.0.1");
    servers.push({ close: () => server.close() });
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const client = new Client({ name: "diagnosis-journey", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const start = performance.now();
      const diagnosisResult = await client.callTool({ name: "diagnose", arguments: { householdId: "demo-blr", item: "purifier", symptom: "beeping again" } });
      expect(performance.now() - start).toBeLessThan(500);
      expect(diagnosisResult.isError).not.toBe(true);
      const diagnosis = diagnosisResult.structuredContent as { data: { diagnosisId: string; status: string; candidates: Array<{ causeKey: string }>; evidence: Array<{ evidenceId: string }>; fixPlan?: { steps: string[]; manualUrl?: string } } };
      expect(diagnosis.data.status).toBe("diagnosed");
      expect(diagnosis.data.candidates[0]?.causeKey).toBe("filter_overdue");
      expect(diagnosis.data.evidence.map((evidence) => evidence.evidenceId)).toContain("ev_overdue_sediment_filter");
      expect(diagnosisResult.content[0]?.text.toLowerCase()).toContain("overdue");
      expect(diagnosis.data.fixPlan?.steps).toHaveLength(6);
      expect(diagnosis.data.fixPlan?.manualUrl).toContain("Kent");
      const resolution = await client.callTool({ name: "log_resolution", arguments: { householdId: "demo-blr", item: "purifier", diagnosisId: diagnosis.data.diagnosisId, causeKey: "filter_overdue", fix: "replaced the sediment filter" } });
      expect(resolution.isError).not.toBe(true);
      expect(resolution.content[0]?.text).toContain("14 April");

      const gas = await client.callTool({ name: "diagnose", arguments: { householdId: "demo-blr", item: "gas", symptom: "I can smell gas" } });
      const safety = gas.structuredContent as { safety?: { emergencyNumber: string }; followUp?: unknown; data: { status: string; fixPlan?: unknown } };
      expect(safety.data.status).toBe("safety_stop");
      expect(safety.safety?.emergencyNumber).toBe("1906");
      expect(safety.followUp).toBeUndefined();
      expect(safety.data.fixPlan).toBeUndefined();
    } finally { await client.close(); (ctx.scheduler as { close?: () => void }).close?.(); }
  });
});
