import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EllieError } from "../lib/errors.js";
import { redactObject, redactText } from "../privacy/redact.js";

export interface Card {
  title: string;
  subtitle?: string;
  items?: Array<{ label: string; value: string; status?: "ok" | "due" | "overdue" | "warning" | "info" }>;
  actions?: Array<{ label: string; url?: string; tool?: string; args?: Record<string, unknown> }>;
}
export interface EllieResult<T = unknown> {
  speech: string;
  data?: T;
  card?: Card;
  followUp?: {
    field: string;
    question: string;
    defaultValue?: string;
    retry?: { tool: string; argName: string; args: Record<string, unknown> };
  };
  phone?: { url: string; kind: "fix" | "booking" | "summary" | "privacy" };
  safety?: { level: "none" | "caution" | "stop"; message?: string; emergencyNumber?: string };
}

export function toolResponse<T>(result: EllieResult<T>): CallToolResult {
  const safe = redactObject(result) as EllieResult<T>;
  return {
    content: [
      { type: "text", text: `${safe.speech}${safe.followUp ? ` ${safe.followUp.question}` : ""}` },
      { type: "text", text: JSON.stringify(safe) },
    ],
    structuredContent: safe as unknown as Record<string, unknown>,
  };
}

export function toolError(error: unknown): CallToolResult {
  const speech = redactText(error instanceof EllieError ? error.speech : "Sorry, something went wrong on my side. Please try again.");
  return { isError: true, content: [{ type: "text", text: speech }] };
}
