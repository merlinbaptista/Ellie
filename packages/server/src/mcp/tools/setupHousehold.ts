import { ToolContracts } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SetupHouseholdInput } from "@ellie/schema";
import type { AppContext } from "../../context.js";
import { setupHousehold } from "../../domain/households.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";
import { maskEmail, maskPhone } from "../../privacy/redact.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "setup_household",
    {
      title: "Set up household",
      description: "Set up or update a household progressively. Ellie asks for one missing detail at a time and never requests a full address.",
      inputSchema: ToolContracts.setup_household.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withTiming("setup_household", ctx, async (args: SetupHouseholdInput) => {
      const result = await setupHousehold(args, ctx);
      const pack = ctx.regions.get(result.household.regionPackId ?? "DEFAULT");
      const contact = result.household.contact;
      const dataHousehold = { ...result.household, ...(contact ? { contact: { ...contact, ...(contact.phone ? { phone: maskPhone(contact.phone) } : {}), ...(contact.email ? { email: maskEmail(contact.email) } : {}) } } : {}) };
      return toolResponse({
        speech: result.speech,
        data: { household: dataHousehold, missing: result.missing },
        ...(result.followUp ? { followUp: {
          ...result.followUp,
          retry: { tool: "setup_household", argName: result.followUp.field, args: { ...args, householdId: result.household.householdId } },
        } } : {}),
        card: {
          title: "Your home settings",
          items: [
            { label: "Country", value: result.household.country ?? "Not set" },
            { label: "City", value: result.household.region ?? "Not set" },
            { label: "Time zone", value: result.household.timeZone ?? "Not set" },
            { label: "Language", value: result.household.language ?? "Not set" },
            { label: "Units", value: `${pack.units.volume}, ${pack.units.temp}, ${pack.units.currency}` },
            { label: "Phone", value: contact?.phone ? maskPhone(contact.phone) : contact?.email ? "Email saved with consent" : "Not set" },
            { label: "Region pack", value: `${pack.packId} ${pack.version}` },
          ],
        },
      });
    }),
  );
}
