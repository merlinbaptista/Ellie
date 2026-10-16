import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpAppHost } from "../src/host/McpAppHost.js";
import type { SimTurnResponse } from "@ellie/schema";

const result: SimTurnResponse = { turnId: "turn-1", speech: "Your gas is due.", cards: [{ title: "Due at home", items: [{ label: "Gas", value: "Today" }], actions: [{ label: "Prediction", tool: "predict_next", args: { item: "gas cylinder" } }] }], state: "done", calls: [], router: { kind: "deterministic", ms: 1 }, totalMs: 20, phoneNotified: false };
afterEach(() => vi.unstubAllGlobals());

describe("MCP Apps host view", () => {
  it("uses a sandbox without same-origin and services view tool calls as simulator turns", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<!doctype html><main>App</main>" }));
    const onToolCall = vi.fn(async () => ({ ...result, speech: "Prediction is tomorrow." }));
    render(<McpAppHost result={result} onToolCall={onToolCall} onOpen={vi.fn()} onClose={vi.fn()} />);
    const frame = await screen.findByTitle("Sandboxed MCP Apps view") as HTMLIFrameElement;
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).not.toHaveAttribute("allow-same-origin");
    await waitFor(() => expect(frame).toHaveAttribute("srcdoc"));
    const sendFromFrame = (data: Record<string, unknown>) => {
      const message = new MessageEvent("message", { data });
      Object.defineProperty(message, "source", { value: frame.contentWindow });
      expect(message.source).toBe(frame.contentWindow);
      window.dispatchEvent(message);
    };
    sendFromFrame({ jsonrpc: "2.0", id: 11, method: "ui/initialize", params: { protocolVersion: "2026-01-26" } });
    sendFromFrame({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("MCP App initialised"));
    const message = new MessageEvent("message", { data: { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "predict_next", arguments: { item: "gas cylinder" } } } });
    Object.defineProperty(message, "source", { value: frame.contentWindow });
    window.dispatchEvent(message);
    await waitFor(() => expect(onToolCall).toHaveBeenCalledWith("predict_next", { item: "gas cylinder" }));
    expect(screen.getByRole("status")).toHaveTextContent("Action ran: predict_next");
  });
});
