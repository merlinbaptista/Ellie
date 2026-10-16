import { ToolContracts, formatLocalDate, matchCatalog, toLocalDate, warrantyStatus, type EventType } from "@ellie/schema";
import type { GetHistoryInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { getTimeline, intervalStats } from "../../domain/history.js";
import { speechList } from "@ellie/schema";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

async function findItem(householdId: string, phrase: string, ctx: AppContext) {
  const items = await ctx.repositories.items.list(householdId);
  const alias = await ctx.repositories.aliases.get(householdId, phrase);
  if (alias) return items.find((item) => item.itemId === alias.itemId);
  const normalized = phrase.toLowerCase().trim();
  return items.find((item) => item.name.toLowerCase() === normalized || item.catalogKey === normalized)
    ?? items.find((item) => normalized.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(normalized));
}

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "get_history",
    {
      title: "Read home history",
      description: "Read back remembered events for a household or item, including when recurring maintenance happened and its typical interval.",
      inputSchema: ToolContracts.get_history.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("get_history", ctx, async (args: GetHistoryInput) => {
      const householdId = args.householdId ?? ctx.env.DEFAULT_HOUSEHOLD_ID;
      const household = await ctx.repositories.households.get(householdId);
      const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
      const item = args.item ? await findItem(householdId, args.item, ctx) : undefined;
      const match = !item && args.item ? matchCatalog(args.item, pack)[0] : undefined;
      const itemId = item?.itemId ?? (args.item ? "__unmatched_item__" : undefined);
      const timeline = await getTimeline(householdId, { itemId, period: args.period, types: args.types as EventType[] | undefined }, ctx);
      const itemEvents = itemId ? timeline.filter((entry) => entry.itemId === itemId) : [];
      const action = pack.catalog[item?.catalogKey ?? match?.catalogKey ?? ""]?.recurring?.action;
      const today = toLocalDate(ctx.clock.now().toISOString(), household?.timeZone ?? pack.locale.defaultTimeZone);
      const stats = action && itemId ? intervalStats(await ctx.repositories.events.list(householdId, itemId), action, today) : null;
      const titleName = item?.name ?? match?.displayName ?? args.item;
      let speech: string;
      if (args.item && itemEvents.length === 0) {
        speech = `I don't have anything about the ${titleName ?? args.item} yet. Tell me when something happens and I'll remember it.`;
      } else if (item) {
        const actionEvents = action ? itemEvents.filter((event) => event.type === action) : [];
        const periodLabel = args.period === "30d" ? "in the last 30 days" : args.period === "90d" ? "in the last 90 days" : args.period === "all" ? "in your records" : "this year";
        const interval = stats?.averageDays === null || stats?.averageDays === undefined ? "" : `, about every ${Math.round(stats.averageDays)} days`;
        const last = actionEvents[0]?.localDate;
        speech = actionEvents.length
          ? `Your ${item.name} was ${action ?? "updated"} ${actionEvents.length} times ${periodLabel}${interval}${last ? `. The last one was ${formatLocalDate(last, pack, "speech")}` : ""}.`
          : `I don't have any ${action ?? "maintenance"} events for the ${item.name} ${periodLabel}.`;
        const symptom = itemEvents.find((event) => event.type === "symptom");
        if (symptom) speech += ` There was a ${symptom.symptom?.description ?? symptom.symptom?.key ?? "problem"} on ${formatLocalDate(symptom.localDate, pack, "speech")}.`;
      } else {
        const top = new Map<string, string>();
        for (const entry of timeline) if (!top.has(entry.itemName)) top.set(entry.itemName, `${entry.itemName} ${entry.type === "symptom" ? "had a problem" : entry.type} ${entry.when}`);
        speech = timeline.length ? `In your recent home history: ${speechList([...top.values()].slice(0, 3))}.` : "I don't have any home events recorded yet.";
      }
      return toolResponse({
        speech,
        data: {
          timeline: timeline.slice(0, 50),
          stats,
          ...(item ? { item, warranty: warrantyStatus(item, today) } : {}),
        },
        card: {
          title: item ? `${pack.catalog[item.catalogKey]?.icon ?? ""} ${item.name}`.trim() : "Home history",
          subtitle: stats?.averageDays !== null && stats?.averageDays !== undefined ? `Average interval: ${Math.round(stats.averageDays)} days` : undefined,
          items: timeline.slice(0, 8).map((entry) => ({ label: `${entry.icon ?? ""} ${entry.itemName}`.trim(), value: `${entry.type} · ${entry.localDate} · ${entry.when}`, status: entry.type === "symptom" ? "warning" as const : "info" as const })),
        },
      });
    }),
  );
}
