import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneFrame } from "../src/phone/PhoneFrame.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("simulator phone panel", () => {
  it("polls outbox messages and opens a short link in the browser frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "msg-1", householdId: "demo-blr", channel: "sms", to: "ending 0001", body: "Headsup: steps are ready", link: "/l/abc123", kind: "fix", sentAt: "2026-10-16T10:00:00.000Z" }] }));
    const onOpen = vi.fn();
    render(<PhoneFrame householdId="demo-blr" refreshKey={0} onOpen={onOpen} onCloseBrowser={vi.fn()} />);
    expect(await screen.findByText("Headsup: steps are ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Headsup link" }));
    const frame = screen.getByTitle("Phone browser");
    await waitFor(() => expect(frame).toHaveAttribute("src", "/l/abc123"));
    expect(onOpen).toHaveBeenCalledWith("/l/abc123");
  });

  it("shows and clears an unread badge when a new message arrives outside Messages", async () => {
    const initialPoll = vi.fn().mockResolvedValue([]);
    let poll: () => Promise<unknown[]> = initialPoll;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => poll().then((value) => ({ ok: true, json: async () => value }))));
    const { rerender } = render(<PhoneFrame householdId="demo-blr" refreshKey={0} browserUrl="/phone/" onOpen={vi.fn()} onCloseBrowser={vi.fn()} />);
    await waitFor(() => expect(initialPoll).toHaveBeenCalled());
    poll = vi.fn().mockResolvedValue([{ id: "msg-2", householdId: "demo-blr", channel: "sms", to: "ending 0001", body: "New link", link: "/l/new", kind: "fix", sentAt: "2026-10-16T10:01:00.000Z" }]);
    rerender(<PhoneFrame householdId="demo-blr" refreshKey={1} browserUrl="/phone/" onOpen={vi.fn()} onCloseBrowser={vi.fn()} />);
    expect(await screen.findByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Messages/ }));
    expect(screen.queryByLabelText("1 unread")).not.toBeInTheDocument();
  });
});
