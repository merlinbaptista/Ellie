import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhoneView } from "@ellie/schema";
import { BookingPage } from "../src/pages/BookingPage.js";
import { SummaryPage } from "../src/pages/SummaryPage.js";

afterEach(() => vi.unstubAllGlobals());
const base = { language: "en-IN", expiresAt: "2026-10-20T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" } as const;
describe("booking and summary pages", () => {
  it("opens provider booking and posts the I booked it action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    const view: PhoneView = { ...base, kind: "booking", title: "Book gas cylinder", sections: [{ heading: "When", body: "Due Monday" }, { heading: "How", body: "WhatsApp. Send from registered number" }], actions: [{ id: "book", label: "Book on WhatsApp", url: "https://wa.me/917588888824?text=REFILL", method: "link" }, { id: "booked", label: "I've booked it", method: "post" }] };
    render(<BookingPage token="token" view={view} lang="en" />);
    expect(screen.getByRole("link", { name: "Book on WhatsApp" })).toHaveAttribute("href", "https://wa.me/917588888824?text=REFILL");
    fireEvent.click(screen.getByRole("button", { name: "I've booked it" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("check that it arrived"));
  });

  it("renders summary status groups and booking actions", () => {
    const view: PhoneView = { ...base, kind: "summary", title: "This week at home", sections: [{ heading: "Overdue", list: ["Sediment filter"] }, { heading: "Due", list: ["Gas cylinder"] }], actions: [{ id: "book", label: "Book gas cylinder", url: "https://example.com", method: "link" }] };
    render(<SummaryPage view={view} lang="en" />);
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Due" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book gas cylinder" })).toBeInTheDocument();
  });
});
