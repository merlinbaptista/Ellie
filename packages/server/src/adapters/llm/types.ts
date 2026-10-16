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
export interface LlmAdapter { readonly name: string; complete(req: LlmRequest): Promise<LlmResponse> }
