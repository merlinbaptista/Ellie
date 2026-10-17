import { ToolContracts } from "@ellie/schema";
import type { AppContext } from "../../context.js";
import type { SimHistoryTurn } from "../session.js";
import type { PlannedCall, RouterResult, SimRouterContext } from "./types.js";
import type { SimulatorMcpClient } from "../mcpClient.js";
import { MCP_INSTRUCTIONS } from "../../mcp/instructions.js";

const routePrompt = "You route utterances for a home voice assistant. Call one tool per thing the user mentioned, in order. Never answer in natural language. householdId is supplied after routing; do not invent it. Never route development tools or status tools. Never call forget_household or forget_item with confirm=true or a confirmationCode unless the user just said the required confirmation.";
const publicTools = new Set(Object.keys(ToolContracts));
function safeToolSchema(tool: { name: string; description?: string; inputSchema: Record<string, unknown> }) {
  return { name: tool.name, description: tool.description ?? tool.name, inputSchema: tool.inputSchema };
}
function redactPrivate(text: string, privateValues: string[] = []): { text: string; restore: (value: unknown) => unknown } {
  const replacements = new Map<string, string>();
  let index = 0;
  let redacted = text.replace(/\+?\d[\d\s().-]{6,}\d/g, (phone) => { const key = `⟦phone${index++}⟧`; replacements.set(key, phone); return key; })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:demo-[a-z0-9-]+|hh_[a-z0-9-]+)\b/gi, "[household]")
    .replace(/\b(my name is|this is|their name is|his name is|her name is)\s+[\p{L}'’-]+/giu, "$1 [name redacted]");
  for (const value of [...new Set(privateValues.filter(Boolean))].sort((left, right) => right.length - left.length)) redacted = redacted.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[private]");
  const restore = (value: unknown): unknown => {
    if (typeof value === "string") { let output = value; for (const [token, original] of replacements) output = output.replaceAll(token, original); return output; }
    if (Array.isArray(value)) return value.map(restore);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restore(child)]));
    return value;
  };
  return { text: redacted, restore };
}

export async function routeWithBedrock(ctx: AppContext, client: SimulatorMcpClient, text: string, history: SimHistoryTurn[], simContext: SimRouterContext): Promise<RouterResult> {
  const started = performance.now();
  if (!ctx.llm.completeWithTools) return { calls: [], kind: "llm", ms: 0, fallbackReason: "LLM adapter does not support tool use" };
  try {
    const [tools, redaction] = await Promise.all([client.listTools(), Promise.resolve(redactPrivate(text, simContext.privateValues))]);
    const specs = tools.filter((tool) => publicTools.has(tool.name) && !tool.name.startsWith("ellie_dev_") && tool.name !== "ellie_status").map(safeToolSchema);
    const response = await ctx.llm.completeWithTools({
      system: `${MCP_INSTRUCTIONS}\n${routePrompt}`,
      messages: [...history.slice(-4).map((turn) => ({ role: "user" as const, content: `User: ${redactPrivate(turn.user, simContext.privateValues).text}\nEllie: ${redactPrivate(turn.speech, simContext.privateValues).text}` })), { role: "user", content: redaction.text }],
      tools: specs,
      maxTokens: 700,
      temperature: 0.1,
      signal: AbortSignal.timeout(ctx.env.SIM_ROUTER_TIMEOUT_MS),
    });
    const calls: PlannedCall[] = [];
    for (const toolCall of response.toolCalls.slice(0, ctx.env.SIM_MAX_TOOL_CALLS)) {
      if (!publicTools.has(toolCall.name)) continue;
      const contract = ToolContracts[toolCall.name as keyof typeof ToolContracts];
      if (!contract) continue;
      const args = { ...toolCall.input, householdId: simContext.householdId };
      const parsed = contract.safeParse(args);
      if (!parsed.success) continue;
      calls.push({ tool: toolCall.name, args: redaction.restore(parsed.data) as Record<string, unknown>, fragment: text });
    }
    if (!calls.length) return { calls: [], kind: "llm", ms: Math.round(performance.now() - started), fallbackReason: "No valid tool calls" };
    return { calls, kind: "llm", ms: response.latencyMs };
  } catch (error) {
    return { calls: [], kind: "llm", ms: Math.round(performance.now() - started), fallbackReason: error instanceof Error ? error.message : "Router failed" };
  }
}
