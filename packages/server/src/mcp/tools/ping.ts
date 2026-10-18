import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../../context.js";
import { toolResponse } from "../result.js";
import { withTiming } from "../withTiming.js";

export function register(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "ellie_ping",
    {
      title: "Ping Headsup",
      description: "Check that Headsup, the home memory agent, is online.",
      inputSchema: { name: z.string().max(60).optional().describe("Who is asking") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withTiming("ellie_ping", ctx, async ({ name }) => {
      const serverTimeUtc = ctx.clock.now().toISOString();
      const clockMode = ctx.clock.isFake() ? "demo time" : "real time";
      return toolResponse({
        speech: `Hi ${name ?? "there"}, Headsup is awake and remembering your home.`,
        data: { ok: true, serverTimeUtc, fakeClock: ctx.clock.isFake(), specVersion: "2025-11-25" },
        card: { title: "Headsup is online", items: [
          { label: "Server time", value: serverTimeUtc },
          { label: "Clock mode", value: clockMode, status: "info" },
        ] },
      });
    }),
  );
}
