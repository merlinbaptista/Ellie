import { describe, expect, it } from "vitest";
import { toolError, toolResponse } from "../src/mcp/result.js";
import { EllieError } from "../src/lib/errors.js";

describe("MCP result envelope", () => {
  it("includes speech, JSON fallback, and structured content", () => {
    const result = { speech: "Hello.", data: { ok: true }, followUp: { field: "date", question: "When was it?" } };
    const response = toolResponse(result);
    expect(response.content[0]).toEqual({ type: "text", text: "Hello. When was it?" });
    expect(response.content[1]).toEqual({ type: "text", text: JSON.stringify(result) });
    expect(response.structuredContent).toEqual(result);
  });

  it("returns friendly errors without exposing stack traces", () => {
    const response = toolError(new EllieError("internal detail", "TEST", "Please try again."));
    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toBe("Please try again.");
    expect(JSON.stringify(response)).not.toContain("internal detail");
    expect(JSON.stringify(response)).not.toContain("stack");
    const unexpected = toolError(new Error("private implementation detail"));
    expect(unexpected.content[0]?.text).toBe("Sorry, something went wrong on my side. Please try again.");
    expect(JSON.stringify(unexpected)).not.toContain("private implementation detail");
  });
});
