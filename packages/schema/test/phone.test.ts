import { describe, expect, it } from "vitest";
import { ChatMessage, PhoneChatRequest, PhoneChatResponse, PhoneLinkPayload, PhoneUiLanguage, PhoneView } from "../src/phone.js";

describe("phone schemas", () => {
  it("validates household-scoped phone link payloads", () => {
    const payload = PhoneLinkPayload.parse({ v: 1, hh: "demo-blr", kind: "booking", ref: "itm_test-1", exp: 1792454400, nonce: "0123456789" });
    expect(payload.kind).toBe("booking");
    expect(() => PhoneLinkPayload.parse({ ...payload, hh: "other-home" })).toThrow();
  });

  it("defaults phone section presentation fields while keeping data browser-safe", () => {
    const view = PhoneView.parse({ kind: "summary", title: "Home", language: "en-IN", sections: [{ heading: "Due" }], actions: [], expiresAt: "2026-10-19T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" });
    expect(view.sections[0]).toMatchObject({ ordered: false, tone: "normal" });
  });

  it("validates chat turns, bounded requests, remaining counts, and UI languages", () => {
    expect(PhoneUiLanguage.parse("kn")).toBe("kn");
    expect(PhoneChatRequest.parse({ message: "  How long?  ", ticked: [0], language: "es" }).message).toBe("How long?");
    const reply = ChatMessage.parse({ id: "m1", role: "ellie", text: "About 15 minutes", citedEvidenceIds: ["step_1"], createdAt: "2026-10-16T00:00:00.000Z" });
    expect(PhoneChatResponse.parse({ reply, remaining: 19 }).remaining).toBe(19);
    expect(() => PhoneChatRequest.parse({ message: "" })).toThrow();
  });
});
