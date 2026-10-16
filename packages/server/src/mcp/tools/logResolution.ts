import { ToolContractShapes, formatLocalDate } from "@ellie/schema";
import type { LogResolutionInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { logResolution } from "../../domain/resolutions.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "log_resolution",
    {
      title: "Record what fixed it",
      description: "Record what fixed a problem at home, whether you fixed it yourself or a technician did, so Ellie can remember next time.",
      inputSchema: ToolContractShapes.log_resolution,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withTiming("log_resolution", ctx, async (args: LogResolutionInput) => {
      const result = await logResolution(ctx, args);
      const nextDue = result.prediction?.mostUrgent?.nextDueLocal;
      const pack = ctx.regions.get(result.resolution.householdId ? (await ctx.repositories.households.get(result.resolution.householdId))?.regionPackId ?? "DEFAULT" : "DEFAULT");
      return toolResponse({
        speech: nextDue
          ? `Thanks — I've noted ${result.resolution.fix}. I'll remind you around ${formatLocalDate(nextDue, pack, "speech")}.`
          : `Thanks — I've noted ${result.resolution.fix}.`,
        data: result,
        card: {
          title: "Resolution recorded",
          items: [
            { label: "Cause", value: result.resolution.cause },
            { label: "Fix", value: result.resolution.fix },
            ...(result.resolution.cost ? [{ label: "Cost", value: `${result.resolution.cost.amount} ${result.resolution.cost.currency}` }] : []),
            ...(nextDue ? [{ label: "Next due", value: nextDue }] : []),
          ],
        },
      });
    }),
  );
}
