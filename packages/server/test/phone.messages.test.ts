import { describe, expect, it } from "vitest";
import { buildEmailMessage, buildReminderSms, buildSmsMessage, formatSmsDate, isGsm7 } from "../src/phone/messages.js";

const shortUrl = "https://ellie.example/l/2345678a";

describe("phone message formatting", () => {
  it("keeps SMS templates GSM-7 and within 160 characters", () => {
    for (const kind of ["fix", "booking", "summary"] as const) {
      const message = buildSmsMessage(kind, { item: "a very long household water purifier item name that needs truncation", detail: "filter overdue", shortUrl });
      expect(message.length).toBeLessThanOrEqual(160);
      expect(isGsm7(message)).toBe(true);
    }
    expect(buildReminderSms("reminder", { item: "gas cylinder", date: "Mon 23 Nov", shortUrl })).toContain("Mon 23 Nov");
    expect(formatSmsDate("2026-11-23", "en-IN", "DMY")).toBe("Mon 23 Nov");
    expect(buildReminderSms("delivery_check", { item: "gas cylinder", shortUrl })).toContain("Tell Alexa");
  });

  it("normalizes rupees and curly punctuation and truncates long item names", () => {
    const message = buildSmsMessage("fix", { item: "water purifier", detail: "₹2,400 – filter’s overdue", shortUrl });
    expect(message).toContain("Rs");
    expect(message).not.toContain("₹");
    expect(message).not.toContain("’");
    expect(isGsm7(message)).toBe(true);
    expect(buildSmsMessage("booking", { item: "x".repeat(60), shortUrl })).toContain("...");
  });

  it("creates plain-text email with at most three bullet details per section", () => {
    const message = buildEmailMessage({ kind: "summary", title: "Home update", language: "en", expiresAt: "2026-10-19T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z", sections: [{ heading: "Due", list: ["A", "B", "C", "D"], ordered: false, tone: "normal" }], actions: [] }, shortUrl);
    expect(message.subject).toBe("Ellie: Home update");
    expect(message.body).toContain("- C");
    expect(message.body).not.toContain("- D");
    expect(message.body).toContain(shortUrl);
  });
});
