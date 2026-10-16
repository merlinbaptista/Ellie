import { describe, expect, it } from "vitest";
import { PhoneLinkPayload, PhoneView } from "../src/phone.js";

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
});
