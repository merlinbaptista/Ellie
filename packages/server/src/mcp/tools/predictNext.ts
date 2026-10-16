import { ToolContracts, formatLocalDate, matchCatalog, matchComponent, toLocalDate, warrantyStatus } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PredictNextInput } from "@ellie/schema";
import type { AppContext } from "../../context.js";
import { recomputeItem } from "../../domain/predictions.js";
import { buildProviderLink } from "../../domain/providerLinks.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "predict_next",
    {
      title: "Predict next maintenance",
      description: "Tell the user when something at home will next run out or need service, and when Ellie will remind them. Use when asked when gas is due or when to change a filter.",
      inputSchema: ToolContracts.predict_next.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("predict_next", ctx, async (args: PredictNextInput) => {
      const householdId = args.householdId ?? ctx.env.DEFAULT_HOUSEHOLD_ID;
      const household = await ctx.repositories.households.get(householdId);
      const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
      const items = await ctx.repositories.items.list(householdId);
      const alias = await ctx.repositories.aliases.get(householdId, args.item);
      const item = (alias ? items.find((candidate) => candidate.itemId === alias.itemId) : undefined)
        ?? items.find((candidate) => candidate.itemId === args.item || candidate.catalogKey === args.item || candidate.name.toLowerCase() === args.item.toLowerCase())
        ?? items.find((candidate) => matchCatalog(args.item, pack).some((match) => match.catalogKey === candidate.catalogKey));
      if (!item) {
        return toolResponse({
          speech: `I'm not tracking ${args.item} yet. Want me to start? Tell me when it was last changed.`,
          followUp: { field: "item", question: "When was it last changed?", defaultValue: "not sure" },
          data: { householdId, item: args.item, tracked: false },
        });
      }
      const entry = pack.catalog[item.catalogKey];
      const componentMatch = args.component ? (entry ? matchComponent(args.component, entry) : null) : null;
      if (args.component && !componentMatch) {
        return toolResponse({ speech: `I couldn't match ${args.component} on the ${item.name}.`, followUp: { field: "component", question: `Which part do you mean on the ${item.name}?` }, data: { item, component: args.component } });
      }
      const all = await recomputeItem(ctx, householdId, item.itemId);
      const selected = componentMatch
        ? all.components.find((prediction) => prediction.component === componentMatch.key)
        : all.mostUrgent;
      if (!selected || selected.status === "unknown") {
        return toolResponse({
          speech: `I don't have enough history for the ${item.name} yet. I'll learn its rhythm after the next one.`,
          data: { item, main: all.main, components: all.components, mostUrgent: selected ?? all.mostUrgent },
          card: { title: item.name, items: [{ label: "Prediction", value: "Learning from your history", status: "info" }] },
        });
      }
      const component = selected.component ? entry?.components.find((candidate) => candidate.key === selected.component) : undefined;
      const displayName = component?.displayName ?? item.name;
      const nextDate = selected.nextDueLocal ? formatLocalDate(selected.nextDueLocal, pack, "speech") : "an unknown date";
      let speech: string;
      if (selected.status === "overdue") {
        const months = Math.max(1, Math.round(Math.abs(selected.daysUntilDue) / 30));
        speech = `Your ${displayName} is about ${months} month${months === 1 ? "" : "s"} overdue. ${selected.explanation}.`;
      } else if (selected.status === "due") speech = `Your ${displayName} is due ${selected.daysUntilDue === 0 ? "today" : `around ${nextDate}`}.`;
      else if (selected.status === "due_soon") speech = `Your ${displayName} is due ${nextDate}.`;
      else speech = `Your ${displayName} should run out around ${nextDate}, ${selected.explanation}.`;
      if (selected.remindOnLocal && ["ok", "due_soon"].includes(selected.status)) {
        speech += ` I'll remind you on ${formatLocalDate(selected.remindOnLocal, pack, "speech")}.`;
      } else if (selected.bookingOpensLocal) {
        speech += ` Bookings open on ${formatLocalDate(selected.bookingOpensLocal, pack, "speech")}.`;
      }
      const provider = item.providerKey ? pack.providers[item.providerKey] : undefined;
      const providerLink = buildProviderLink(provider, { displayName: item.name, brand: item.brand, model: item.model });
      const componentRows = all.components.map((prediction) => {
        const part = entry?.components.find((candidate) => candidate.key === prediction.component);
        return { label: part?.displayName ?? prediction.component ?? "Component", value: prediction.nextDueLocal ?? prediction.explanation, status: prediction.status === "overdue" ? "overdue" as const : prediction.status === "due" ? "due" as const : prediction.status === "due_soon" ? "due" as const : "info" as const };
      });
      const today = toLocalDate(ctx.clock.now().toISOString(), household?.timeZone ?? pack.locale.defaultTimeZone);
      const warranty = item.warrantyUntil ? warrantyStatus(item, today) : undefined;
      return toolResponse({
        speech,
        data: { item, main: all.main, components: all.components, mostUrgent: all.mostUrgent, providerLink, warranty, ...(selected.status === "due" ? { suggestedNextTool: "send_to_phone" } : {}) },
        card: {
          title: `${entry?.icon ?? ""} ${displayName}`.trim(),
          items: [
            { label: "Next due", value: selected.nextDueLocal ?? "Unknown", status: selected.status === "overdue" ? "overdue" : selected.status === "due" ? "due" : selected.status === "due_soon" ? "due" : "info" },
            { label: "Remind on", value: selected.remindOnLocal ?? "Not scheduled" },
            ...(selected.bookingOpensLocal ? [{ label: "Bookings open", value: selected.bookingOpensLocal }] : []),
            { label: "Based on", value: selected.explanation },
            { label: "Confidence", value: selected.confidence },
            { label: "Last changed", value: selected.lastEventLocal ?? "Not recorded" },
            ...componentRows,
          ],
          ...(providerLink && ["due", "overdue"].includes(selected.status) ? { actions: [{ label: "Book", url: providerLink }] } : {}),
        },
      });
    }),
  );
}
