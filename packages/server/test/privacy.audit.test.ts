import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import pino from "pino";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MockLlm } from "../src/adapters/llm/mock.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
const clients: Client[] = [];
afterAll(async () => { await Promise.all(clients.splice(0).map((client) => client.close())); await closeAllSessions(); await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("privacy audit", () => {
  it("does not leak seeded contacts or signed link tokens to logs, mock LLM requests, or tool output", async () => {
    const logLines: string[] = [];
    const ctx = await createTestContext();
    ctx.logger = pino({ level: "trace" }, { write: (line: string) => logLines.push(line) } as never);
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const app = createApp(ctx);
    const server = app.listen(0, "127.0.0.1"); servers.push(server); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    ctx.env.ELLIE_PUBLIC_BASE_URL = base;
    const client = new Client({ name: "privacy-audit", version: "1" }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const result = await client.callTool({ name: "what_do_you_know", arguments: { householdId: "demo-blr" } });
    const serializedToolResult = JSON.stringify(result.structuredContent ?? result);
    expect(serializedToolResult).not.toContain("+919000000001");
    expect(serializedToolResult).not.toContain("demo-tx@example.com");
    expect(serializedToolResult).toContain("•••• 0001");

    const toolOutputs = [serializedToolResult];
    const jsonResponses: string[] = [];
    const handoff = await client.callTool({ name: "send_to_phone", arguments: { householdId: "demo-blr", contentType: "privacy" } });
    const handoffResult = handoff.structuredContent as { data: { shortUrl: string } };
    toolOutputs.push(JSON.stringify(handoff.structuredContent ?? handoff));
    const redirect = await fetch(handoffResult.data.shortUrl, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const phoneUrl = new URL(redirect.headers.get("location")!, base);
    const phoneToken = phoneUrl.searchParams.get("t")!;
    const phoneViewResponse = await fetch(`${base}/api/phone/view`, { headers: { authorization: `Bearer ${phoneToken}` } });
    const phoneView = await phoneViewResponse.json();
    jsonResponses.push(JSON.stringify(phoneView));
    const exportResponse = await fetch(`${base}/api/phone/export`, { headers: { authorization: `Bearer ${phoneToken}` } });
    jsonResponses.push(await exportResponse.text());
    const withdrawalResponse = await fetch(`${base}/api/phone/privacy/withdraw`, { method: "POST", headers: { authorization: `Bearer ${phoneToken}` } });
    jsonResponses.push(JSON.stringify(await withdrawalResponse.json()));

    await ctx.llm.complete({ system: "Test redaction", messages: [{ role: "user", content: "Call +919000000001 or demo-tx@example.com. Bearer abc.def" }], maxTokens: 10 });
    const capturedLlm = JSON.stringify(MockLlm.requests.at(-1));
    expect(capturedLlm).not.toContain("+919000000001");
    expect(capturedLlm).not.toContain("demo-tx@example.com");
    expect(capturedLlm).not.toContain("Bearer abc.def");
    expect(logLines.join("\n")).not.toContain("+919000000001");
    expect(logLines.join("\n")).not.toContain("demo-tx@example.com");
    expect(logLines.join("\n")).not.toContain("Bearer abc.def");
    const publicOutput = `${toolOutputs.join("\n")}\n${jsonResponses.join("\n")}`;
    expect(publicOutput).not.toContain("+919000000001");
    expect(publicOutput).not.toContain("9000000001");
    expect(publicOutput).not.toContain("demo-tx@example.com");
    expect(publicOutput).not.toContain("Bearer ");
    expect(publicOutput).not.toContain(phoneToken);
    expect(publicOutput).not.toMatch(/[?&]t=[^\s"&]+/);
  });
});
