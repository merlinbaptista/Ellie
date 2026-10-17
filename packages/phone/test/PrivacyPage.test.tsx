import { axe, toHaveNoViolations } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhoneView } from "@ellie/schema";
import { PrivacyPage } from "../src/pages/PrivacyPage.js";

expect.extend(toHaveNoViolations);
afterEach(() => vi.unstubAllGlobals());
const view: PhoneView = { kind: "privacy", title: "Your privacy and home data", language: "en-IN", sections: [
  { heading: "What I remember", list: ["Water purifier: 5 events"] },
  { heading: "Who it's shared with", list: ["Nothing leaves this computer"] },
  { heading: "How long I keep things", list: ["Outbox: 30 days"] },
  { heading: "Messages", list: ["phone_messages: granted"] },
], actions: [], expiresAt: "2026-10-20T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" };
const inventory = { householdId: "demo-blr", profile: { country: "IN", region: "Bengaluru", timeZone: "Asia/Kolkata", language: "en-IN", contactMasked: "•••• 0001" }, items: [{ itemId: "itm_purifier", name: "Water purifier", eventCount: 5, firstLocal: "2026-01-01", lastLocal: "2026-10-01", hasWarranty: true, nextDueLocal: null }], counts: { items: 1, events: 5, resolutions: 0, reminders: 0, outbox: 0, diagnoses: 0, links: 0, consentRecords: 1 }, consent: [], sharedWith: [{ service: "This computer", purpose: "Local", dataSent: "Nothing leaves this computer." }], retention: [{ data: "Outbox", keptFor: "30 days" }], generatedAt: "2026-10-16T00:00:00.000Z" };

describe("phone privacy page", () => {
  it("shows privacy sections and controls with no axe violations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => inventory, blob: async () => new Blob(["{}"], { type: "application/json" }) }) as Response));
    const { container } = render(<PrivacyPage token="test-token" view={view} lang="en" />);
    await screen.findByText("Water purifier");
    expect(screen.getByRole("button", { name: "Download my data" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("requires a separate confirmation for item forget and typed erase", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({ ok: true, json: async () => init?.method === "POST" ? { message: "Forgotten." } : inventory, blob: async () => new Blob() }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivacyPage token="test-token" view={view} lang="en" />);
    await screen.findByText("Water purifier");
    fireEvent.click(screen.getByRole("button", { name: "Forget item" }));
    expect(screen.getByRole("button", { name: "Confirm forget" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type erase to delete everything"), { target: { value: "erase" } });
    expect(screen.getByRole("button", { name: "Erase everything" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm forget" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/phone/privacy/forget-item", expect.objectContaining({ method: "POST" })));
  });
});
