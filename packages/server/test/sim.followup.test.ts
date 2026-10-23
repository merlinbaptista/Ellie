import { describe, expect, it } from "vitest";
import { answerForPending } from "../src/simulator/orchestrator.js";
import { clearPending, createSimSession, getSimSession } from "../src/simulator/session.js";

describe("simulator follow-up state", () => {
  it("maps uncertainty to the offered default and yes/no to booleans", () => {
    const pending = { question: "When was it changed?", retry: { tool: "log_event", argName: "previousWhen", args: {} }, defaultValue: "about a month ago", askedAt: Date.now() };
    expect(answerForPending("I'm not sure", pending)).toBe("about a month ago");
    const phoneChoice = { ...pending, retry: { ...pending.retry, argName: "contentType" } };
    expect(answerForPending("send the booking link", phoneChoice)).toBe("booking");
    expect(answerForPending("the fix steps", phoneChoice)).toBe("fix");
    expect(answerForPending("not sure", { ...phoneChoice, defaultValue: "fix" })).toBe("fix");
    expect(answerForPending("yes", { ...phoneChoice, defaultValue: "fix" })).toBe("fix");
    const consent = { ...pending, retry: { ...pending.retry, argName: "consent" } };
    expect(answerForPending("yes", consent)).toBe(true);
    expect(answerForPending("no", consent)).toBe(false);
  });
  it("clears queued questions on a household change", () => {
    const session = createSimSession("demo-blr");
    session.pending = { question: "First?", retry: { tool: "log_event", argName: "when", args: {} }, askedAt: Date.now() };
    session.queued.push({ question: "Next?", retry: { tool: "log_event", argName: "previousWhen", args: {} }, askedAt: Date.now() });
    clearPending(session);
    expect(session.pending).toBeUndefined();
    expect(session.queued).toEqual([]);
    expect(getSimSession(session.id)?.householdId).toBe("demo-blr");
  });
});
