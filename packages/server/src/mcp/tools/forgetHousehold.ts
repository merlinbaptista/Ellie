import { ToolContracts } from "@ellie/schema";
import type { ForgetHouseholdInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { resolveHouseholdId } from "../../domain/households.js";
import { saveConfirmation, takeConfirmation, clearConfirmation, makeSpokenCode, normalizeSpokenCode } from "../../privacy/confirm.js";
import { executeForgetHousehold, forgetHouseholdPlan } from "../../privacy/forget.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool("forget_household", {
    title: "Erase household data",
    description: "Plan and confirm deletion of all remembered household data. Requires the two-word code Ellie reads aloud.",
    inputSchema: ToolContracts.forget_household.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, withTiming("forget_household", ctx, async (args: ForgetHouseholdInput) => {
    const householdId = resolveHouseholdId(args.householdId, ctx);
    if (!args.confirmationId || !args.confirmationCode) {
      const { plan, planHash } = await forgetHouseholdPlan(ctx, householdId);
      const code = makeSpokenCode();
      const confirmation = await saveConfirmation(ctx, householdId, "household", planHash, code);
      const question = `This will erase everything I know about your home and can't be undone. To confirm, say: forget everything, ${code}.`;
      return toolResponse({ speech: question, followUp: { field: "confirmationCode", question, retry: { tool: "forget_household", argName: "confirmationCode", args: { householdId, confirmationId: confirmation.id } } }, data: { plannedRecords: plan.householdRows.length + plan.sharedRows.length } });
    }
    const confirmation = await takeConfirmation(ctx, householdId, args.confirmationId, "household", false);
    if (!confirmation?.code || normalizeSpokenCode(args.confirmationCode) !== normalizeSpokenCode(confirmation.code)) {
      return toolResponse({ speech: "That code didn't match, so I haven't deleted anything." });
    }
    const current = await forgetHouseholdPlan(ctx, householdId);
    if (current.planHash !== confirmation.planHash) {
      await clearConfirmation(ctx, householdId, args.confirmationId);
      const code = makeSpokenCode();
      const renewed = await saveConfirmation(ctx, householdId, "household", current.planHash, code);
      const question = `New information arrived while I was waiting. To confirm the updated erase, say: forget everything, ${code}.`;
      return toolResponse({ speech: question, followUp: { field: "confirmationCode", question, retry: { tool: "forget_household", argName: "confirmationCode", args: { householdId, confirmationId: renewed.id } } } });
    }
    await clearConfirmation(ctx, householdId, args.confirmationId);
    const receipt = await executeForgetHousehold(ctx, householdId);
    return toolResponse({ speech: "Everything is erased. This household is now empty.", data: receipt });
  }));
}
