export interface LlmMessage { role: "user" | "assistant"; content: string }
export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  responseFormat?: "text" | "json";
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}
export interface LlmResponse { text: string; model: string; latencyMs: number; mock: boolean; usage?: { inputTokens?: number; outputTokens?: number } }
export interface LlmToolSpec { name: string; description: string; inputSchema: Record<string, unknown> }
export interface LlmToolCall { name: string; input: Record<string, unknown> }
export interface LlmToolRequest extends Omit<LlmRequest, "responseFormat"> { tools: LlmToolSpec[] }
export interface LlmToolResponse { toolCalls: LlmToolCall[]; latencyMs: number }
export interface LlmAdapter {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
  completeWithTools?(req: LlmToolRequest): Promise<LlmToolResponse>;
}
