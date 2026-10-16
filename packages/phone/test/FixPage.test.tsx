import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhoneView } from "@ellie/schema";
import { FixPage } from "../src/pages/FixPage.js";

const fixView: PhoneView = { kind: "fix", title: "Purifier fix", language: "en-IN", sections: [{ heading: "What's likely wrong", body: "The filter is overdue", ordered: false, tone: "normal" }, { heading: "Steps", list: ["Switch off", "Replace filter", "Flush"], ordered: true, tone: "normal" }, { heading: "You'll need", list: ["Filter cartridge"], ordered: false, tone: "normal" }], actions: [{ id: "fixed", label: "Fixed it", method: "post" }, { id: "not_fixed", label: "Didn't work", method: "post" }, { id: "chat", label: "Ask a question", method: "post" }], expiresAt: "2026-10-20T00:00:00.000Z", generatedAt: "2026-10-16T00:00:00.000Z" };

afterEach(() => vi.unstubAllGlobals());
describe("FixPage", () => {
  it("persists step progress and shows the fixed confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, nextDue: "2027-04-14" }) }));
    render(<FixPage token="secret" view={fixView} refId="dgn_fix-1" lang="en" onRefresh={async () => undefined} />);
    fireEvent.click(screen.getByLabelText("Switch off"));
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fixed it" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("14 April"));
    expect(fetch).toHaveBeenCalledWith("/api/phone/actions/fixed", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret" }) }));
  });

  it("shows only a safety callout for safety-stop views", () => {
    const safety: PhoneView = { ...fixView, sections: [{ heading: "Safety", body: "Leave and call 1906.", ordered: false, tone: "safety" }], actions: [{ id: "call", label: "Call emergency services", url: "tel:1906", method: "link" }] };
    render(<FixPage token="secret" view={safety} refId="dgn_safety-1" lang="en" onRefresh={async () => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("1906");
    expect(screen.getByRole("link", { name: "Call emergency services" })).toHaveAttribute("href", "tel:1906");
    expect(screen.queryByText("Replace filter")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask a question" })).not.toBeInTheDocument();
  });
});
