import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { routeWithBedrock } from "../src/simulator/routers/bedrock.js";
import type { SimulatorMcpClient } from "../src/simulator/mcpClient.js";

describe("Bedrock simulator router", () => {
  it("builds public tool specs, validates calls, restores phones, and caps the plan", async () => {
    const ctx = await createTestContext();
    const sent: { tools?: Array<{ name: string }>; text?: string } = {};
    const llm = {
      name: "bedrock",
      complete: async () => ({ text: "", model: "test", latencyMs: 1, mock: false }),
      completeWithTools: async (request: { tools: Array<{ name: string }>; messages: Array<{ content: string }> }) => {
        sent.tools = request.tools;
        sent.text = request.messages.at(-1)?.content;
        return { latencyMs: 7, toolCalls: [
          { name: "log_event", input: { item: "gas cylinder", type: "changed", provider: "+1 212 555 0199" } },
          { name: "ellie_status", input: {} },
          { name: "predict_next", input: { item: "gas cylinder", unexpected: true } },
          { name: "due_this_week", input: {} },
        ] };
      },
    };
    (ctx as unknown as { llm: typeof llm }).llm = llm;
    const client: SimulatorMcpClient = { listTools: async () => ["log_event", "predict_next", "due_this_week", "ellie_dev_time_travel", "ellie_status"].map((name) => ({ name, description: name, inputSchema: { type: "object" } })), callTool: async () => ({ content: [] }), readResource: async () => "", close: async () => undefined };
    const result = await routeWithBedrock(ctx, client, "I changed the gas in Bengaluru at Merlin's home, phone +1 212 555 0199; household demo-blr", [], { householdId: "demo-blr", language: "en-IN", privateValues: ["Bengaluru", "Merlin's home"] });
    expect(result.calls.map((call) => call.tool)).toEqual(["log_event", "due_this_week"]);
    expect(result.calls[0]?.args.provider).toBe("+1 212 555 0199");
    expect(sent.tools?.map((tool) => tool.name)).toEqual(["log_event", "predict_next", "due_this_week"]);
    expect(sent.text).not.toContain("212 555 0199");
    expect(sent.text).not.toContain("Bengaluru");
    expect(sent.text).not.toContain("Merlin");
    expect(sent.text).not.toContain("demo-blr");
    expect(result.kind).toBe("llm");
  });

  it("falls back when tool use is unavailable or errors", async () => {
    const ctx = await createTestContext();
    const client: SimulatorMcpClient = { listTools: async () => [], callTool: async () => ({ content: [] }), readResource: async () => "", close: async () => undefined };
    const result = await routeWithBedrock(ctx, client, "what's due", [], { householdId: "demo-blr", language: "en-IN" });
    expect(result.calls).toEqual([]);
    expect(result.fallbackReason).toMatch(/does not support/i);
  });
});
