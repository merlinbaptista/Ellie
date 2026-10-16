import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EllieError } from "../lib/errors.js";

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
  phone?: { url: string; kind: "fix" | "booking" | "summary" };
  safety?: { level: "none" | "caution" | "stop"; message?: string; emergencyNumber?: string };
}

export function toolResponse<T>(result: EllieResult<T>): CallToolResult {
  return {
    content: [
      { type: "text", text: `${result.speech}${result.followUp ? ` ${result.followUp.question}` : ""}` },
      { type: "text", text: JSON.stringify(result) },
    ],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

export function toolError(error: unknown): CallToolResult {
  const speech = error instanceof EllieError ? error.speech : "Sorry, something went wrong on my side. Please try again.";
  return { isError: true, content: [{ type: "text", text: speech }] };
}
