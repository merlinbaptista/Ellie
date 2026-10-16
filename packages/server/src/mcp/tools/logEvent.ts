import { ToolContracts, formatMoney, toLocalDate } from "@ellie/schema";
import type { LogEventInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { intervalStats } from "../../domain/history.js";
import { logEvent } from "../../domain/events.js";
import { intervalToPhrase } from "../../domain/speech.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "log_event",
    {
      title: "Remember a home event",
      description: "Record something that happened at home: a supply changed or refilled, an appliance serviced, a problem noticed, a booking or delivery, or money spent. Call once per thing. 'item' is what the user called it.",
      inputSchema: ToolContracts.log_event.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    withTiming("log_event", ctx, async (args: LogEventInput) => {
      const result = await logEvent(args, ctx);
      const pack = ctx.regions.get(result.household.regionPackId ?? "DEFAULT");
      const today = toLocalDate(ctx.clock.now().toISOString(), result.household.timeZone ?? pack.locale.defaultTimeZone);
      const recurring = pack.catalog[result.item.catalogKey]?.recurring;
      const allEvents = await ctx.repositories.events.list(result.household.householdId, result.item.itemId);
      const stats = intervalStats(allEvents, recurring?.action ?? args.type, today);
      const previousAction = result.event ? [...allEvents].reverse().find((event) => event.eventId !== result.event?.eventId && event.type === (recurring?.action ?? args.type)) : undefined;
      const previousDays = previousAction && result.event ? Math.max(0, Math.round((Date.parse(`${result.event.localDate}T00:00:00Z`) - Date.parse(`${previousAction.localDate}T00:00:00Z`)) / 86_400_000)) : null;
      let speech: string;
      if (result.followUp) speech = "Got it.";
      else if (result.safety) speech = result.safety.message;
      else if (result.deduped) speech = "I already have that.";
      else if (result.previousEvent && result.event) {
        const days = Math.abs(Date.parse(`${result.event.localDate}T00:00:00Z`) - Date.parse(`${result.previousEvent.localDate}T00:00:00Z`)) / 86_400_000;
        speech = `Thanks. I've saved both dates — ${intervalToPhrase(days)} apart.`;
      } else if (result.custom && result.created) speech = `Noted. I'll start tracking ${result.item.name}.`;
      else if (args.type === "changed" && previousDays !== null) speech = `Noted — ${result.item.name} changed today. That's ${previousDays} days since the last one.`;
      else if (args.type === "changed") speech = `Noted — ${result.item.name} changed today.`;
      else if (args.type === "serviced") speech = `Noted — ${result.item.name} serviced today.`;
      else if (args.type === "symptom") speech = `Noted — ${result.item.name} ${args.symptom ?? "has a problem"}.`;
      else if (args.type === "booked") speech = `Noted — ${result.item.name} booked.`;
      else if (args.type === "delivered") speech = `Noted — ${result.item.name} delivered.`;
      else if (args.type === "cost") speech = `Noted — ${formatMoney({ amount: args.cost ?? 0, currency: result.household.units?.currency ?? pack.units.currency }, pack.locale.defaultLanguage)} for ${result.item.name}.`;
      else speech = `Noted — ${result.item.name}.`;

      const followUp = result.followUp ? {
        field: result.followUp.field,
        question: result.followUp.question,
        defaultValue: result.followUp.defaultValue,
        retry: result.followUp.retry,
      } : undefined;
      return toolResponse({
        speech,
        data: { event: result.event, item: result.item, ...(result.previousEvent ? { previousEvent: result.previousEvent } : {}), deduped: result.deduped, stats },
        ...(followUp ? { followUp } : {}),
        ...(result.safety ? { safety: { level: "stop" as const, message: result.safety.message, emergencyNumber: result.safety.emergencyNumber } } : {}),
        ...(result.event ? { card: {
          title: `${pack.catalog[result.item.catalogKey]?.icon ?? ""} ${result.item.name}`.trim(),
          items: [
            { label: "Event", value: args.type, status: "info" as const },
            { label: "Date", value: result.event.localDate },
            ...(previousDays !== null ? [{ label: "Days since previous", value: String(previousDays) }] : []),
            ...(result.item.warrantyUntil ? [{ label: "Warranty until", value: result.item.warrantyUntil }] : []),
          ],
          actions: [{ label: "See history", tool: "get_history", args: { householdId: result.household.householdId, item: result.item.name } }],
        } } : {}),
      });
    }),
  );
}
