import { ToolContracts, diffDays, formatLocalDate, toLocalDate, warrantyStatus, type Prediction } from "@ellie/schema";
import type { DueThisWeekInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { computePrediction } from "../../prediction/engine.js";
import { loadHouseholdSnapshot } from "../../domain/snapshot.js";
import { speechList } from "@ellie/schema";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";
import { mcpAppMeta } from "../apps.js";

interface DueEntry {
  itemId: string;
  component?: string;
  displayName: string;
  status: "ok" | "due_soon" | "due" | "overdue" | "warranty" | "delivery";
  nextDueLocal?: string;
  daysUntilDue?: number;
  reason: string;
  icon?: string;
  priority: number;
}

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "due_this_week",
    {
      title: "What's due at home",
      description: "Give the household a short briefing of what is due, overdue, or expiring soon. Use for what's due this week, home to-dos, and morning briefings.",
      inputSchema: ToolContracts.due_this_week.shape,
      ...(mcpAppMeta() ? { _meta: mcpAppMeta() } : {}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("due_this_week", ctx, async (args: DueThisWeekInput) => {
      const householdId = args.householdId ?? ctx.env.DEFAULT_HOUSEHOLD_ID;
      const snapshot = await loadHouseholdSnapshot(householdId, ctx);
      const pack = ctx.regions.get(snapshot.profile?.regionPackId ?? "DEFAULT");
      const timeZone = snapshot.profile?.timeZone ?? pack.locale.defaultTimeZone;
      const today = toLocalDate(ctx.clock.now().toISOString(), timeZone);
      const entries: DueEntry[] = [];
      for (const item of snapshot.items.filter((candidate) => candidate.active)) {
        const events = snapshot.eventsByItem.get(item.itemId) ?? [];
        const catalog = pack.catalog[item.catalogKey];
        const common = {
          householdId,
          item,
          ...(catalog ? { catalog } : {}),
          events,
          pack,
          timeZone,
          todayLocal: today,
          computedAt: ctx.clock.now().toISOString(),
          windowDays: args.days,
        };
        const predictions: Prediction[] = [computePrediction(common)];
        if (catalog) for (const component of catalog.components) {
          if (!events.some((event) => event.component === component.key)) continue;
          predictions.push(computePrediction({ ...common, component: { key: component.key, displayName: component.displayName, defaultIntervalDays: component.defaultIntervalDays } }));
        }
        for (const prediction of predictions) {
          if (prediction.status === "unknown") continue;
          if (!args.includeOk && prediction.status === "ok") continue;
          if (prediction.status !== "ok" && prediction.status !== "overdue" && prediction.status !== "due" && prediction.status !== "due_soon") continue;
          const component = prediction.component ? catalog?.components.find((candidate) => candidate.key === prediction.component) : undefined;
          entries.push({
            itemId: item.itemId,
            ...(prediction.component ? { component: prediction.component } : {}),
            displayName: component?.displayName ?? item.name,
            status: prediction.status,
            ...(prediction.nextDueLocal ? { nextDueLocal: prediction.nextDueLocal } : {}),
            daysUntilDue: prediction.daysUntilDue,
            reason: prediction.explanation,
            ...(catalog?.icon ? { icon: catalog.icon } : {}),
            priority: prediction.status === "overdue" ? 0 : prediction.status === "due" ? 1 : prediction.status === "due_soon" ? 2 : 3,
          });
        }
        if (item.warrantyUntil) {
          const warranty = warrantyStatus(item, today);
          if (warranty.status === "valid" && (warranty.daysLeft ?? 999) <= 30) entries.push({
            itemId: item.itemId,
            displayName: `${item.name} warranty`,
            status: "warranty",
            nextDueLocal: item.warrantyUntil,
            daysUntilDue: warranty.daysLeft,
            reason: "Warranty expires within 30 days",
            priority: 4,
          });
        }
        const booked = events.filter((event) => event.type === "booked").sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
        const hasDelivery = booked && events.some((event) => event.type === "delivered" && event.relatedEventId === booked.eventId);
        if (booked?.booking?.expectedDeliveryLocal && !hasDelivery && booked.booking.expectedDeliveryLocal <= today) entries.push({
          itemId: item.itemId,
          displayName: `${item.name} delivery`,
          status: "delivery",
          nextDueLocal: booked.booking.expectedDeliveryLocal,
          daysUntilDue: diffDays(today, booked.booking.expectedDeliveryLocal),
          reason: "Expected delivery has not been recorded",
          priority: 5,
        });
      }
      entries.sort((left, right) => left.priority - right.priority || (left.status === "overdue" ? (left.daysUntilDue ?? 0) - (right.daysUntilDue ?? 0) : (left.daysUntilDue ?? 0) - (right.daysUntilDue ?? 0)));
      const spoken = entries.slice(0, 3).map((entry) => {
        if (entry.status === "overdue") return `the ${entry.displayName} is about ${Math.max(1, Math.round(Math.abs(entry.daysUntilDue ?? 0) / 30))} months overdue`;
        if (entry.status === "due") return `the ${entry.displayName} is due ${entry.nextDueLocal === today ? "today" : `on ${formatLocalDate(entry.nextDueLocal!, pack, "speech")}`}`;
        if (entry.status === "due_soon" || entry.status === "ok") return `the ${entry.displayName} is due ${entry.nextDueLocal ? `on ${formatLocalDate(entry.nextDueLocal, pack, "speech")}` : "soon"}`;
        if (entry.status === "warranty") return `the ${entry.displayName} expires on ${formatLocalDate(entry.nextDueLocal!, pack, "speech")}`;
        return `the ${entry.displayName} is expected`;
      });
      const speech = spoken.length
        ? `${speechList(spoken).replace(/^./, (first) => first.toUpperCase())}.${entries.length > spoken.length ? ` And ${entries.length - spoken.length} more on your screen.` : ""}`
        : "Nothing is due this week. Your home is in good shape.";
      return toolResponse({
        speech,
          data: { entries: entries.map((entry) => ({ itemId: entry.itemId, component: entry.component, displayName: entry.displayName, status: entry.status, nextDueLocal: entry.nextDueLocal, daysUntilDue: entry.daysUntilDue, reason: entry.reason })), generatedForLocal: today },
        card: {
          title: "This week at home",
          // A glanceable card: the entries are already ordered by urgency, and the full list stays in structuredContent.
          items: entries.slice(0, 6).map((entry) => ({
            label: `${entry.icon ?? ""} ${entry.displayName}`.trim(),
            value: `${entry.nextDueLocal ?? ""}${entry.reason ? ` · ${entry.reason}` : ""}`,
            status: entry.status === "overdue" ? "overdue" as const : entry.status === "due" || entry.status === "due_soon" ? "due" as const : entry.status === "warranty" ? "warning" as const : "info" as const,
          })),
          actions: entries.slice(0, 3).map((entry) => ({ label: `View ${entry.displayName}`, tool: "predict_next", args: { householdId, item: snapshot.items.find((item) => item.itemId === entry.itemId)?.name ?? entry.itemId, ...(entry.component ? { component: entry.component } : {}) } })),
        },
      });
    }),
  );
}
