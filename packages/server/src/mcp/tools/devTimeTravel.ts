import { z } from "zod";
import { toLocalDate } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { localDateToUtc } from "@ellie/schema";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

const inputShape = z.object({
  days: z.number().int().min(-400).max(400).optional(),
  to: z.string().optional(),
  reset: z.boolean().optional(),
}).strict();
const inputSchema = inputShape.superRefine((value, ctx) => {
  const count = Number(value.days !== undefined) + Number(value.to !== undefined) + Number(value.reset === true);
  if (count !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide exactly one of days, to, or reset" });
  if (value.to && !/^\d{4}-\d{2}-\d{2}$/.test(value.to) && !Number.isFinite(Date.parse(value.to))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Enter a valid ISO date or date-time" });
  }
});

export function register(server: McpServer, ctx: AppContext): void {
  if (ctx.env.NODE_ENV === "production") return;
  server.registerTool(
    "ellie_dev_time_travel",
    {
      title: "Demo: time travel",
      description: "Move the demo clock to test due dates and fire scheduled reminders.",
      inputSchema: inputShape.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    withTiming("ellie_dev_time_travel", ctx, async (rawArgs) => {
      const args = inputSchema.parse(rawArgs);
      if (args.reset) ctx.clock.set(null);
      else if (args.days !== undefined) ctx.clock.set(new Date(ctx.clock.now().getTime() + args.days * 86_400_000).toISOString());
      else if (args.to) {
        const household = await ctx.repositories.households.get(ctx.env.DEFAULT_HOUSEHOLD_ID);
        const zone = household?.timeZone ?? "UTC";
        const target = /^\d{4}-\d{2}-\d{2}$/.test(args.to)
          ? localDateToUtc(args.to, zone, 9)
          : new Date(args.to).toISOString();
        ctx.clock.set(target);
      }
      const firedJobs = await ctx.scheduler.tick?.() ?? 0;
      const household = await ctx.repositories.households.get(ctx.env.DEFAULT_HOUSEHOLD_ID) ?? (await ctx.repositories.households.list())[0];
      const zone = household?.timeZone ?? "UTC";
      const now = ctx.clock.now().toISOString();
      const date = toLocalDate(now, zone);
      const outboxPreview = await ctx.notifier.listOutbox?.(household?.householdId, 3) ?? [];
      return toolResponse({
        speech: `It's now ${date}. ${firedJobs} reminder${firedJobs === 1 ? " was" : "s were"} sent.`,
        data: { now, firedJobs, outboxPreview },
        card: { title: "Demo clock", items: [{ label: "Local date", value: date }, { label: "Fired jobs", value: String(firedJobs) }] },
      });
    }),
  );
}
