import { axe, toHaveNoViolations } from "jest-axe";
import { render } from "@testing-library/react";
import { expect, describe, it } from "vitest";
import type { PhoneView } from "@ellie/schema";
import { BookingPage } from "../src/pages/BookingPage.js";
import { ErrorPage } from "../src/pages/ErrorPage.js";
import { FixPage } from "../src/pages/FixPage.js";
import { SummaryPage } from "../src/pages/SummaryPage.js";

expect.extend(toHaveNoViolations);

const dates = { language: "en-IN", expiresAt: "2026-10-20T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" } as const;
const fixView: PhoneView = {
  ...dates,
  kind: "fix",
  title: "Purifier fix",
  sections: [
    { heading: "What's likely wrong", body: "The filter is overdue.", ordered: false, tone: "normal" },
    { heading: "Steps", list: ["Switch off the purifier."], ordered: true, tone: "normal" },
  ],
  actions: [{ id: "fixed", label: "Fixed it", method: "post" }, { id: "not_fixed", label: "Didn't work", method: "post" }, { id: "chat", label: "Ask a question", method: "post" }],
};

async function expectAccessible(ui: React.ReactElement) {
  const { container } = render(ui);
  expect(await axe(container)).toHaveNoViolations();
}

describe("phone page accessibility", () => {
  it("has no axe violations on the fix view", async () => {
    await expectAccessible(<FixPage token="test" view={fixView} refId="a11y-fix" lang="en" onRefresh={async () => undefined} />);
  });

  it("has no axe violations on the safety-only view", async () => {
    const view: PhoneView = { ...fixView, sections: [{ heading: "Safety", body: "Leave the area and call emergency services.", ordered: false, tone: "safety" }], actions: [{ id: "call", label: "Call emergency services", url: "tel:1906", method: "link" }] };
    await expectAccessible(<FixPage token="test" view={view} refId="a11y-safety" lang="en" onRefresh={async () => undefined} />);
  });

  it("has no axe violations on the booking view", async () => {
    const view: PhoneView = { ...dates, kind: "booking", title: "Book gas cylinder", sections: [{ heading: "When", body: "Due Monday" }, { heading: "How", body: "Send from your registered number" }], actions: [{ id: "book", label: "Book online", url: "https://example.com", method: "link" }, { id: "booked", label: "I've booked it", method: "post" }] };
    await expectAccessible(<BookingPage token="test" view={view} lang="en" />);
  });

  it("has no axe violations on the summary view", async () => {
    const view: PhoneView = { ...dates, kind: "summary", title: "This week at home", sections: [{ heading: "Due", list: ["Gas cylinder"] }], actions: [] };
    await expectAccessible(<SummaryPage view={view} lang="en" />);
  });

  it("has no axe violations on the error view", async () => {
    await expectAccessible(<ErrorPage noToken lang="en" />);
  });
});