import { ToolContracts } from "@ellie/schema";
import type { WhatDoYouKnowInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { resolveHouseholdId } from "../../domain/households.js";
import { buildInventory } from "../../privacy/inventory.js";
import { loadHouseholdSnapshot } from "../../domain/snapshot.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool("what_do_you_know", {
    title: "What Headsup knows",
    description: "Tell the user what Headsup remembers about their home and who it is shared with. Use for 'what do you know about me/my home' or 'what are you storing'.",
    inputSchema: ToolContracts.what_do_you_know.shape,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, withTiming("what_do_you_know", ctx, async (args: WhatDoYouKnowInput) => {
    const householdId = resolveHouseholdId(args.householdId, ctx);
    const inventory = await buildInventory(ctx, householdId);
    const snapshot = await loadHouseholdSnapshot(householdId, ctx);
    const selected = args.item ? inventory.items.filter((entry) => entry.name.toLowerCase().includes(args.item!.toLowerCase())) : inventory.items;
    const count = selected.length;
    const totalEvents = selected.reduce((sum, entry) => sum + entry.eventCount, 0);
    const headline = count ? `I'm tracking ${count} ${count === 1 ? "thing" : "things"}${selected.length ? ` — ${selected.map((entry) => entry.name).join(", ")}` : ""}, with ${totalEvents} ${totalEvents === 1 ? "event" : "events"}${selected[0]?.firstLocal ? ` since ${selected[0].firstLocal.slice(0, 7)}` : ""}.` : "I don't know anything about your home yet.";
    const history = args.item ? selected[0] : undefined;
    const fixes = history ? snapshot.resolutions.filter((entry) => entry.itemId === history.itemId) : [];
    const speech = history
      ? `For the ${history.name}, I have ${history.eventCount} ${history.eventCount === 1 ? "event" : "events"}${history.lastLocal ? `, last on ${history.lastLocal}` : ""}${history.hasWarranty ? `, warranty until ${snapshot.items.find((entry) => entry.itemId === history.itemId)?.warrantyUntil}` : ""}, and ${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}${fixes[0] ? `, most recently ${fixes[0].localDate}` : ""}.`
      : `${headline} I can send the full list to your phone, or forget anything you ask.`;
    const latestPhoneConsent = inventory.consent.filter((entry) => entry.purpose === "phone_messages").at(-1);
    const consentStatus = latestPhoneConsent ? latestPhoneConsent.action : inventory.profile.contactMasked ? "granted" : "not set";
    return toolResponse({ speech, data: inventory, card: { title: "What Headsup knows", items: [
      ...selected.map((entry) => ({ label: entry.name, value: `${entry.eventCount} events · last ${entry.lastLocal ?? "not recorded"} · due ${entry.nextDueLocal ?? "unknown"}` })),
      { label: "Shared with", value: inventory.sharedWith.map((entry) => entry.service).join(", ") || "Nothing leaves this computer." },
      { label: "Messages", value: `${consentStatus} · contact ${inventory.profile.contactMasked ?? "not saved"}` },
    ], actions: [
      { label: "Send to phone", tool: "send_to_phone", args: { householdId, contentType: "privacy" } },
      ...(selected[0] ? [{ label: "Forget an item…", tool: "forget_item", args: { householdId, item: selected[0].name } }] : []),
    ] } });
  }));
}
