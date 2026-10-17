import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { seedDemo } from "../src/seed/seed.js";
import { canSend } from "../src/privacy/consent.js";
import { householdPk, pendingSk } from "../src/data/keys.js";
import { createTestContext } from "./helpers.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
const clients: Client[] = [];
afterAll(async () => { await Promise.all(clients.splice(0).map((client) => client.close())); await closeAllSessions(); await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("privacy Journey 6", () => {
  it("reports, sends, confirms a forget, and withdraws consent over the real MCP client", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const app = createApp(ctx);
    const server = app.listen(0, "127.0.0.1"); servers.push(server); await once(server, "listening");
    const client = new Client({ name: "privacy-journey", version: "1" }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)));

    const knowledge = await client.callTool({ name: "what_do_you_know", arguments: { householdId: "demo-blr" } });
    const inventory = (knowledge.structuredContent as { data: { items: Array<{ name: string }> } }).data;
    expect(inventory.items.map((item) => item.name)).toHaveLength(4);
    expect(JSON.stringify(knowledge.structuredContent)).not.toContain("+919000000001");

    const sent = await client.callTool({ name: "send_to_phone", arguments: { householdId: "demo-blr", contentType: "privacy" } });
    expect((sent.structuredContent as { phone?: { kind: string } }).phone?.kind).toBe("privacy");

    const firstItem = (await ctx.repositories.items.list("demo-blr")).find((item) => item.catalogKey === "inverter_battery")!;
    const question = await client.callTool({ name: "forget_item", arguments: { householdId: "demo-blr", item: firstItem.name } });
    const questionContent = question.structuredContent as { followUp: { retry: { args: Record<string, unknown> } } };
    expect(questionContent.followUp.retry.args.confirmationId).toBeTruthy();
    await ctx.storage.put({ pk: householdPk("demo-blr"), sk: pendingSk(`${firstItem.itemId}:new-question`), type: "pending", data: { itemId: firstItem.itemId } });
    const staleConfirmation = await client.callTool({ name: "forget_item", arguments: { ...questionContent.followUp.retry.args, confirm: true } });
    const changedPlan = staleConfirmation.structuredContent as { followUp: { retry: { args: Record<string, unknown> } } };
    expect(changedPlan.followUp.retry.args.confirmationId).toBeTruthy();
    expect(await ctx.repositories.items.get("demo-blr", firstItem.itemId)).not.toBeNull();
    const deleted = await client.callTool({ name: "forget_item", arguments: { ...changedPlan.followUp.retry.args, confirm: true } });
    // The renewed confirmation must execute; print the whole response if it does not, so a failure is never unexplained.
    expect((deleted.structuredContent as { data?: { scope: string } }).data?.scope, `renewed confirmation did not execute: ${JSON.stringify(deleted.structuredContent)}`).toBe("item");
    expect(await ctx.repositories.items.get("demo-blr", firstItem.itemId)).toBeNull();

    const withdrawal = await client.callTool({ name: "manage_consent", arguments: { householdId: "demo-blr", action: "withdraw", purpose: "phone_messages" } });
    expect((withdrawal.structuredContent as { speech: string }).speech).toContain("won't send");
    expect(await canSend(ctx, "demo-blr", "phone_messages")).toBe(false);

    const eraseQuestion = await client.callTool({ name: "forget_household", arguments: { householdId: "demo-tx" } });
    const erasePrompt = eraseQuestion.structuredContent as { speech: string; followUp: { retry: { args: Record<string, unknown> } } };
    const confirmationCode = erasePrompt.speech.match(/forget everything, ([a-z]+ [a-z]+)/i)?.[1];
    expect(confirmationCode).toBeTruthy();
    const wrongCode = await client.callTool({ name: "forget_household", arguments: { ...erasePrompt.followUp.retry.args, confirmationCode: "wrong code" } });
    expect((wrongCode.structuredContent as { speech: string }).speech).toContain("didn't match");
    expect(await ctx.repositories.items.list("demo-tx")).toHaveLength(4);
    const erased = await client.callTool({ name: "forget_household", arguments: { ...erasePrompt.followUp.retry.args, confirmationCode } });
    expect((erased.structuredContent as { speech: string }).speech).toContain("Everything is erased");
    expect(await ctx.repositories.items.list("demo-tx")).toEqual([]);
    const eraseAudit = (await ctx.storage.query("AUDIT")).find((row) => row.data.householdId === "demo-tx" && row.data.action === "household_erased");
    expect(eraseAudit?.data.counts).toBeDefined();
    expect(JSON.stringify(eraseAudit?.data)).not.toContain("propane");
  });
});
