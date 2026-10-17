import { ToolContracts } from "@ellie/schema";
import type { ManageConsentInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { resolveHouseholdId } from "../../domain/households.js";
import { canSend, consentHistory, grantConsent, recordConsent } from "../../privacy/consent.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";
import { maskEmail } from "../../privacy/redact.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool("manage_consent", {
    title: "Manage message consent",
    description: "Check, grant, or withdraw consent for household messages and reminders.",
    inputSchema: ToolContracts.manage_consent.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, withTiming("manage_consent", ctx, async (args: ManageConsentInput) => {
    const householdId = resolveHouseholdId(args.householdId, ctx);
    if (args.action === "status") {
      const allowed = await canSend(ctx, householdId, args.purpose);
      const history = await consentHistory(ctx, householdId);
      const lastGranted = history.filter((entry) => entry.purpose === args.purpose && entry.action === "granted").at(-1);
      const household = await ctx.repositories.households.get(householdId);
      const contact = household?.contact?.phone ?? household?.contact?.email;
      const ending = contact ? contact.includes("@") ? maskEmail(contact) : `ending ${contact.slice(-4)}` : "no contact saved";
      return toolResponse({ speech: allowed ? `I can send messages ${ending}. You gave permission${lastGranted ? ` on ${lastGranted.at.slice(0, 10)}` : ""}.` : "Message consent is off. I won't send messages to you.", data: { allowed, records: history } });
    }
    if (args.action === "withdraw") {
      await recordConsent(ctx, { householdId, purpose: args.purpose, action: "withdrawn", source: "voice", note: "User requested withdrawal" });
      return toolResponse({ speech: args.purpose === "phone_messages" ? "Okay — I won't send anything to your phone, and I've deleted the number." : "Okay — I won't send those messages, and I've deleted that contact." });
    }
    const household = await ctx.repositories.households.get(householdId);
    const phone = args.phone ?? (args.purpose !== "email_messages" ? household?.contact?.phone : undefined);
    const email = args.email ?? (args.purpose === "email_messages" ? household?.contact?.email : undefined);
    if (!phone && !email) {
      const field = args.purpose === "email_messages" ? "email" : "phone";
      const question = args.purpose === "email_messages" ? "Which email address should I use?" : "What phone number should I use?";
      return toolResponse({ speech: question, followUp: { field, question, retry: { tool: "manage_consent", argName: field, args: { householdId, action: "grant", purpose: args.purpose } } } });
    }
    if (args.confirm !== true) {
      const question = "Can I save that contact for messages and reminders? Say yes to allow it.";
      return toolResponse({ speech: question, followUp: { field: "confirm", question, retry: { tool: "manage_consent", argName: "confirm", args: { householdId, action: "grant", purpose: args.purpose, ...(phone ? { phone } : {}), ...(email ? { email } : {}) } } } });
    }
    const granted = await grantConsent(ctx, { householdId, purpose: args.purpose, source: "voice", ...(phone ? { phone } : {}), ...(email ? { email } : {}), confirm: true });
    return toolResponse({ speech: granted.speech, data: granted.record });
  }));
}
