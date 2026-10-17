import { describe, expect, it } from "vitest";
import { redactObject, redactText } from "../src/privacy/redact.js";

describe("privacy redaction", () => {
  it("masks phone, email, bearer/JWT/link tokens, and query tokens while preserving dates", () => {
    const value = "Call +919000000001 or demo-tx@example.com at 2026-10-16. Bearer abc.def; eyJhbGci.eyJzdWI.abc; link abcdefghijklmnopqrstuvwxyz.abcdefghijklmnopqrstuvwxyz12345678901234567890; /phone/?t=secret-token";
    const redacted = redactText(value);
    expect(redacted).not.toContain("+919000000001");
    expect(redacted).not.toContain("demo-tx@example.com");
    expect(redacted).not.toContain("Bearer abc.def");
    expect(redacted).not.toContain("secret-token");
    expect(redacted).toContain("2026-10-16");
  });

  it("redacts contact-shaped properties recursively", () => {
    expect(redactObject({ data: { phone: "+919000000001", email: "demo-tx@example.com", safe: "a normal date 2026-10-16" } })).toEqual({ data: { phone: "[REDACTED]", email: "[REDACTED]", safe: "a normal date 2026-10-16" } });
  });

  it("preserves IPv4 hosts in local phone links", () => {
    expect(redactText("http://127.0.0.1:53941/l/short-code")).toBe("http://127.0.0.1:53941/l/short-code");
  });
});
