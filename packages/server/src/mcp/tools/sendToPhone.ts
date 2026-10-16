import { ToolContracts } from "@ellie/schema";
import type { SendToPhoneInput } from "@ellie/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { sendToPhone } from "../../domain/sendToPhone.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "send_to_phone",
    {
      title: "Send to phone",
      description: "Send something to the user's phone: fix steps for a problem, a booking link, or a summary of what's due. Use when the user says 'send it to my phone' or accepts Ellie's offer.",
      inputSchema: ToolContracts.send_to_phone.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withTiming("send_to_phone", ctx, async (args: SendToPhoneInput) => {
      const result = await sendToPhone(ctx, args);
      if (result.followUp) return toolResponse({ speech: result.speech, followUp: result.followUp });
      return toolResponse({
        speech: result.speech,
        ...(result.data ? { data: result.data } : {}),
        ...(result.data ? { phone: { url: result.data.shortUrl, kind: args.contentType } } : {}),
        ...(result.card ? { card: { title: "Sent to phone", items: [
          { label: "Channel", value: result.card.channel },
          { label: "To", value: result.card.to },
          { label: "Expires", value: result.card.expiresAt },
        ], actions: [{ label: "Open", url: result.card.url }] } } : {}),
      });
    }),
  );
}
