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

  it("keeps spoken dates, day counts and quantities intact across sentence boundaries", () => {
    expect(redactText("It's now 2026-10-16. 0 reminders were sent.")).toBe("It's now 2026-10-16. 0 reminders were sent.");
    expect(redactText("It's now 2026-10-16. 12 reminders were sent.")).toBe("It's now 2026-10-16. 12 reminders were sent.");
    expect(redactText("Your gas cylinder is due on 2026-10-25, 9 days from now, and you have used 14.2 kg.")).toContain("2026-10-25, 9 days from now");
    expect(redactText("I'll forget the inverter and its 12 events, 3 fixes and 1 reminders.")).toContain("12 events, 3 fixes and 1 reminders");
    expect(redactText("Next service 2026-10-16 09:00 local time.")).toContain("2026-10-16 09:00");
    expect(redactText("Logged at 2026-10-16T03:30:00.000Z.")).toContain("2026-10-16T03:30:00.000Z");
  });

  it("still masks phone numbers in every written form", () => {
    for (const phone of ["+919000000001", "+1 (555) 555-0100", "+1-555-555-0100", "919000000001", "555.555.0100", "919-000-0001"]) {
      expect(redactText(`Call ${phone} now.`)).not.toContain(phone);
      expect(redactText(`Call ${phone} now.`)).toContain("[REDACTED_PHONE]");
    }
    expect(redactText("Texted 2026-10-16 from +919000000001.")).toBe("Texted 2026-10-16 from [REDACTED_PHONE].");
  });

  it("never mangles a confirmation UUID whose first segment is all digits", () => {
    const confirmationId = "12345678-91ce-40b7-b257-bdc5ec2739ff";
    expect(redactText(confirmationId)).toBe(confirmationId);
    expect(redactObject({ followUp: { retry: { args: { confirmationId } } } })).toEqual({ followUp: { retry: { args: { confirmationId } } } });
    for (const id of ["00000000-0000-4000-8000-000000000000", "98765432-1234-4abc-8def-123456789012", "4df316f2-143a-47a9-97f0-3ecfbec2d34a"]) {
      expect(redactText(`confirmationId=${id}`)).toContain(id);
    }
  });
});
