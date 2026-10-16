import { ToolContracts, formatLocalDate, formatMoney, toLocalDate } from "@ellie/schema";
import type { LogEventInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { intervalStats } from "../../domain/history.js";
import { logEvent } from "../../domain/events.js";
import { intervalToPhrase } from "../../domain/speech.js";
import { recomputeItem } from "../../domain/predictions.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

function predictionSentence(prediction: { nextDueLocal: string | null; remindOnLocal: string | null } | null | undefined, pack: ReturnType<AppContext["regions"]["get"]>): string {
  if (!prediction?.nextDueLocal || !prediction.remindOnLocal) return "";
  return ` Next one around ${formatLocalDate(prediction.nextDueLocal, pack, "speech")}; I'll remind you on ${formatLocalDate(prediction.remindOnLocal, pack, "speech")}.`;
}

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
      const predictions = result.event && ["changed", "serviced", "booked", "delivered"].includes(args.type)
        ? await recomputeItem(ctx, result.household.householdId, result.item.itemId)
        : undefined;
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
        speech = `Thanks — ${intervalToPhrase(days)} apart.${predictionSentence(predictions?.mostUrgent, pack)}`;
      } else if (result.custom && result.created) speech = `Noted. I'll start tracking ${result.item.name}.`;
      else if (args.type === "changed" && previousDays !== null) speech = `Noted — ${result.item.name} changed, ${previousDays} days after the last one.${predictionSentence(predictions?.mostUrgent, pack)}`;
      else if (args.type === "changed") speech = `Noted — ${result.item.name} changed today.${predictionSentence(predictions?.mostUrgent, pack)}`;
      else if (args.type === "serviced") speech = `Noted — ${result.item.name} serviced today.${predictionSentence(predictions?.mostUrgent, pack)}`;
      else if (args.type === "symptom") speech = `Noted — ${result.item.name} ${args.symptom ?? "has a problem"}.`;
      else if (args.type === "booked") speech = `Noted — ${result.item.name} booked. I'll check it arrived around ${result.event?.booking?.expectedDeliveryLocal ?? "the expected delivery date"}.`;
      else if (args.type === "delivered") speech = `Noted — ${result.item.name} delivered.${predictionSentence(predictions?.mostUrgent, pack)}`;
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
        data: { event: result.event, item: result.item, ...(result.previousEvent ? { previousEvent: result.previousEvent } : {}), deduped: result.deduped, stats, ...(predictions ? { prediction: predictions } : {}) },
        ...(followUp ? { followUp } : {}),
        ...(result.safety ? { safety: { level: "stop" as const, message: result.safety.message, emergencyNumber: result.safety.emergencyNumber } } : {}),
        ...(result.event ? { card: {
          title: `${pack.catalog[result.item.catalogKey]?.icon ?? ""} ${result.item.name}`.trim(),
          items: [
            { label: "Event", value: args.type, status: "info" as const },
            { label: "Date", value: result.event.localDate },
            ...(previousDays !== null ? [{ label: "Days since previous", value: String(previousDays) }] : []),
            ...(result.item.warrantyUntil ? [{ label: "Warranty until", value: result.item.warrantyUntil }] : []),
            ...(predictions?.mostUrgent?.nextDueLocal ? [{ label: "Next due", value: predictions.mostUrgent.nextDueLocal, status: predictions.mostUrgent.status === "overdue" ? "overdue" as const : predictions.mostUrgent.status === "due" ? "due" as const : "info" as const }] : []),
            ...(predictions?.mostUrgent?.remindOnLocal ? [{ label: "Remind on", value: predictions.mostUrgent.remindOnLocal }] : []),
            ...(predictions?.mostUrgent ? [{ label: "Confidence", value: predictions.mostUrgent.confidence }] : []),
          ],
          actions: [{ label: "See history", tool: "get_history", args: { householdId: result.household.householdId, item: result.item.name } }],
        } } : {}),
      });
    }),
  );
}
