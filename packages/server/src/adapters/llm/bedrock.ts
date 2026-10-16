import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Logger } from "pino";
import type { Env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";
import type { LlmAdapter, LlmRequest, LlmResponse } from "./types.js";

export class BedrockLlm implements LlmAdapter {
  readonly name = "bedrock";
  lastLatencyMs = 0;
  private readonly client: BedrockRuntimeClient;
  constructor(private readonly env: Env, private readonly logger: Logger) {
    this.client = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({ requestTimeout: env.LLM_BACKGROUND_TIMEOUT_MS }),
    });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.env.BEDROCK_MODEL_ID) throw new ExternalServiceError("BEDROCK_MODEL_ID is not configured", "My explanation service is unavailable, so I'll use my household records.");
    const started = performance.now();
    const system = `${req.system}${req.responseFormat === "json" ? "\nReturn only JSON." : ""}`;
    try {
      const response = await this.client.send(new ConverseCommand({
        modelId: this.env.BEDROCK_MODEL_ID,
        system: [{ text: system }],
        messages: req.messages.map((message) => ({ role: message.role, content: [{ text: message.content }] })),
        inferenceConfig: { maxTokens: req.maxTokens ?? this.env.BEDROCK_MAX_TOKENS, temperature: req.temperature ?? 0.2 },
        ...(this.env.BEDROCK_GUARDRAIL_ID ? { guardrailConfig: { guardrailIdentifier: this.env.BEDROCK_GUARDRAIL_ID, guardrailVersion: this.env.BEDROCK_GUARDRAIL_VERSION ?? "DRAFT" } } : {}),
      }), { abortSignal: req.signal });
      this.lastLatencyMs = Math.round(performance.now() - started);
      const rawText = response.output?.message?.content?.map((part) => part.text ?? "").join("") ?? "";
      let text = rawText;
      if (req.responseFormat === "json") {
        const start = rawText.indexOf("{");
        const end = rawText.lastIndexOf("}");
        if (start >= 0 && end > start) text = rawText.slice(start, end + 1);
      }
      return {
        text,
        model: this.env.BEDROCK_MODEL_ID,
        latencyMs: this.lastLatencyMs,
        mock: false,
        usage: {
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
        },
      };
    } catch (error) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
      const reason = awsError.name === "AccessDeniedException"
        ? "Bedrock model access is not enabled"
        : awsError.name === "ThrottlingException"
          ? "Bedrock is throttling requests"
          : awsError.name === "ValidationException"
            ? "Bedrock rejected the request"
            : req.signal?.aborted ? "Bedrock request timed out" : "Bedrock request failed";
      this.logger.warn({ model: this.env.BEDROCK_MODEL_ID, reason, name: awsError.name, statusCode: awsError.$metadata?.httpStatusCode, requestId: awsError.$metadata?.requestId, ms: Math.round(performance.now() - started) }, "Bedrock completion failed");
      throw new ExternalServiceError(reason, "My explanation service is unavailable, so I'll use my household records.");
    }
  }

  close(): void { this.client.destroy(); }
}
