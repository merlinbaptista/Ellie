import { setTimeout as delay } from "node:timers/promises";
import type { LlmAdapter, LlmRequest, LlmResponse } from "./types.js";
import { redactText } from "../../privacy/redact.js";

type MockHandler = { match: (req: LlmRequest) => boolean; respond: (req: LlmRequest) => string | Promise<string> };
const handlers: MockHandler[] = [];

export function registerMockHandler(match: MockHandler["match"], respond: MockHandler["respond"]): () => void {
  const handler = { match, respond };
  handlers.unshift(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function clearMockHandlers(): void { handlers.length = 0; }

export class MockLlm implements LlmAdapter {
  readonly name = "mock-llm";
  static testDelayMs: number | undefined;
  static requests: LlmRequest[] = [];
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const safeRequest: LlmRequest = { ...req, system: redactText(req.system), messages: req.messages.map((message) => ({ ...message, content: redactText(message.content) })) };
    MockLlm.requests.push(safeRequest);
    if (MockLlm.requests.length > 100) MockLlm.requests.shift();
    const started = performance.now();
    await delay(MockLlm.testDelayMs ?? 30 + Math.floor(Math.random() * 51), undefined, { signal: safeRequest.signal });
    const handler = handlers.find((candidate) => candidate.match(safeRequest));
    const lastMessage = safeRequest.messages.at(-1)?.content ?? "";
    const text = handler
      ? await handler.respond(safeRequest)
      : safeRequest.responseFormat === "json"
        ? JSON.stringify({ mock: true, echo: lastMessage.slice(0, 200) })
        : `(mock) ${lastMessage}`;
    return { text, model: "mock", latencyMs: Math.round(performance.now() - started), mock: true };
  }
}
