import { describe, expect, it } from "vitest";
import { combineResults } from "../src/simulator/combine.js";
import type { ResultPart } from "../src/simulator/combine.js";

describe("simulator result combining", () => {
  const router = { kind: "deterministic" as const, ms: 2 };
  const part = (tool: string, speech: string, extra: Partial<ResultPart> = {}): ResultPart => ({ call: { tool, args: {}, ms: 20, ok: true, result: {} }, speech, ...extra });
  it("returns only the safety result when any call stops", () => {
    const result = combineResults("turn", [part("log_event", "Saved."), part("diagnose", "Leave now and call 1906.", { safety: { level: "stop" }, card: { title: "Safety" } })], router, 40);
    expect(result.state).toBe("safety_stop");
    expect(result.speech).toBe("Leave now and call 1906.");
    expect(result.cards).toEqual([{ title: "Safety" }]);
    expect(result.calls).toHaveLength(1);
  });
  it("drops earlier offers and caps the combined speech", () => {
    const result = combineResults("turn", [part("log_event", "Saved. Want the steps on your phone?"), part("diagnose", "The filter is overdue. It may need service. Warranty ends in December. Use the manual.")], router, 42);
    expect(result.speech).not.toContain("Want the steps");
    expect(result.speech.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(4);
  });
  it("retains one pending follow-up and marks phone handoffs", () => {
    const result = combineResults("turn", [part("send_to_phone", "Sent to your phone.", { data: { status: "sent" } })], router, 20, { question: "Which provider?" });
    expect(result.state).toBe("awaiting_answer");
    expect(result.followUp?.question).toBe("Which provider?");
    expect(result.phoneNotified).toBe(true);
  });
});
