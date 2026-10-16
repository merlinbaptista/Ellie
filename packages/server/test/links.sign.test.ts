import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { signPhoneLink, verifyPhoneLink } from "../src/links/sign.js";

const env = loadEnv({ LINK_SIGNING_SECRET: "a sufficiently long secret for phone links", PHONE_LINK_TTL_HOURS: "1" });

describe("phone link signatures", () => {
  it("round-trips a household-scoped payload and expires on wall clock, not fake clock", () => {
    const signed = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: "dgn_test-1", env });
    const token = verifyPhoneLink(signed.token, env, Date.parse("2026-10-16T00:00:00.000Z"));
    expect(token.hh).toBe("demo-blr");
    expect(token.kind).toBe("fix");
    expect(token.ref).toBe("dgn_test-1");
    expect(signed.expiresAt).toBe(new Date(token.exp * 1000).toISOString());
    expect(() => verifyPhoneLink(signed.token, env, (token.exp + 1) * 1000)).toThrow("expired");
  });

  it("rejects tampering and malformed tokens", () => {
    const { token } = signPhoneLink({ householdId: "hh_sign-1", kind: "summary", env });
    const [body, signature] = token.split(".");
    expect(() => verifyPhoneLink(`${body}.${signature!.slice(0, -1)}A`, env)).toThrow("invalid");
    expect(() => verifyPhoneLink("not-a-token", env)).toThrow("invalid");
  });

  it("requires a long non-default secret in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production", LINK_SIGNING_SECRET: "short" })).toThrow("LINK_SIGNING_SECRET must be at least 32 characters");
    expect(() => loadEnv({ NODE_ENV: "production", LINK_SIGNING_SECRET: "change-me-in-production" })).toThrow("LINK_SIGNING_SECRET must be at least 32 characters");
  });
});
