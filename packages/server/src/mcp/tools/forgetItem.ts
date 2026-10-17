import { ToolContracts, matchCatalog } from "@ellie/schema";
import type { ForgetItemInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { normalizePhrase } from "../../data/keys.js";
import { resolveHouseholdId } from "../../domain/households.js";
import { loadHouseholdSnapshot } from "../../domain/snapshot.js";
import { saveConfirmation, takeConfirmation } from "../../privacy/confirm.js";
import { executeForgetItem, forgetItem } from "../../privacy/forget.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

async function resolveItem(ctx: AppContext, householdId: string, phrase: string): Promise<string | undefined> {
  const snapshot = await loadHouseholdSnapshot(householdId, ctx);
  const normalized = normalizePhrase(phrase);
  const alias = snapshot.aliases.find((entry) => normalizePhrase(entry.phrase) === normalized);
  if (alias) return alias.itemId;
  const direct = snapshot.items.find((entry) => entry.itemId === phrase || entry.name.toLowerCase() === phrase.toLowerCase() || entry.catalogKey === phrase);
  if (direct) return direct.itemId;
  const profile = snapshot.profile;
  const pack = ctx.regions.get(profile?.regionPackId ?? "DEFAULT");
  const catalogMatch = matchCatalog(phrase, pack)[0];
  return catalogMatch ? snapshot.items.find((entry) => entry.catalogKey === catalogMatch.catalogKey)?.itemId : undefined;
}

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool("forget_item", {
    title: "Forget an item",
    description: "Plan and confirm removal of a remembered household item and its related history. Never delete until the user confirms.",
    inputSchema: ToolContracts.forget_item.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, withTiming("forget_item", ctx, async (args: ForgetItemInput) => {
    const householdId = resolveHouseholdId(args.householdId, ctx);
    const itemId = await resolveItem(ctx, householdId, args.item);
    if (!itemId) return toolResponse({ speech: `I couldn't find ${args.item}, so nothing was changed.` });
    if (args.confirm === false) return toolResponse({ speech: "Okay, I've kept it." });
    if (args.confirm !== true || !args.confirmationId) {
      const { plan, planHash } = await forgetItem(ctx, householdId, itemId);
      const [snapshot, jobs] = await Promise.all([loadHouseholdSnapshot(householdId, ctx), ctx.scheduler.list(householdId)]);
      const item = snapshot.items.find((entry) => entry.itemId === itemId)!;
      const eventCount = snapshot.eventsByItem.get(itemId)?.length ?? 0;
      const resolutionCount = snapshot.resolutions.filter((entry) => entry.itemId === itemId).length;
      const reminderCount = jobs.filter((job) => job.payload.itemId === itemId).length;
      const confirmation = await saveConfirmation(ctx, householdId, "item", planHash);
      const question = `I'll forget the ${item.name} and its ${eventCount} events, ${resolutionCount} fixes and ${reminderCount} reminders. Should I go ahead?`;
      return toolResponse({ speech: "I'll prepare that deletion for your confirmation.", followUp: { field: "confirm", question, retry: { tool: "forget_item", argName: "confirm", args: { householdId, item: itemId, confirmationId: confirmation.id } } }, data: { planKeys: plan.householdRows.length + plan.sharedRows.length } });
    }
    const confirmation = await takeConfirmation(ctx, householdId, args.confirmationId, "item");
    if (!confirmation) return toolResponse({ speech: "That confirmation expired, so I haven't deleted anything. Ask me to forget the item again." });
    const current = await forgetItem(ctx, householdId, itemId);
    if (current.planHash !== confirmation.planHash) {
      const renewed = await saveConfirmation(ctx, householdId, "item", current.planHash);
      const question = "New information was added since I asked. Should I forget the updated item history too?";
      return toolResponse({ speech: question, followUp: { field: "confirm", question, retry: { tool: "forget_item", argName: "confirm", args: { householdId, item: itemId, confirmationId: renewed.id } } } });
    }
    const itemName = (await ctx.repositories.items.get(householdId, itemId))?.name ?? args.item;
    const receipt = await executeForgetItem(ctx, householdId, itemId);
    return toolResponse({ speech: `Done — I've forgotten the ${itemName}.`, data: receipt });
  }));
}
