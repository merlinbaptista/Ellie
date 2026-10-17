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

  it("returns a destructive confirmation id unchanged, whatever digits the UUID has", () => {
    for (const confirmationId of ["12345678-91ce-40b7-b257-bdc5ec2739ff", "4df316f2-143a-47a9-97f0-3ecfbec2d34a", "00000000-0000-4000-8000-000000000000"]) {
      const response = toolResponse({ speech: "I'll prepare that deletion for your confirmation.", followUp: { field: "confirm", question: "Should I go ahead?", retry: { tool: "forget_item", argName: "confirm", args: { householdId: "demo-blr", item: "itm_1", confirmationId } } }, data: { planKeys: 7 } });
      expect((response.structuredContent as { followUp: { retry: { args: { confirmationId: string } } } }).followUp.retry.args.confirmationId).toBe(confirmationId);
    }
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
