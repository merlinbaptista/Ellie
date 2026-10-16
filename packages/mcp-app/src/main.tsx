import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Card, type EllieCard } from "@ellie/ui";
import "@ellie/ui/tokens.css";
import "@ellie/ui/ui.css";

interface EllieResult { speech?: string; card?: EllieCard; data?: unknown }
interface RpcMessage { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }
function McpCardApp() {
  const [result, setResult] = useState<EllieResult>();
  const [theme, setTheme] = useState("light");
  const pending = React.useRef(new Map<number, (value: unknown) => void>());
  const sequence = React.useRef(1);
  function send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = sequence.current++;
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    return new Promise((resolve) => pending.current.set(id, resolve));
  }
  function notify(method: string, params?: Record<string, unknown>): void { window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*"); }
  useEffect(() => {
    const handler = (event: MessageEvent<RpcMessage>) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (!message || message.jsonrpc !== "2.0") return;
      if (message.method === "ui/initialize" && message.id !== undefined) {
        window.parent.postMessage({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26", capabilities: { tools: { call: true }, openLinks: true }, appInfo: { name: "Ellie", version: "0.1.0" } } }, "*");
        notify("ui/notifications/initialized");
        return;
      }
      if (message.id !== undefined && pending.current.has(Number(message.id))) {
        pending.current.get(Number(message.id))?.(message.result);
        pending.current.delete(Number(message.id));
      }
      if (message.method === "ui/notifications/tool-result") {
        const value = (message.params?.structuredContent ?? (message.params?.result as Record<string, unknown> | undefined)?.structuredContent ?? message.params?.result ?? message.params) as EllieResult | undefined;
        if (value && typeof value === "object") setResult(value);
      }
      if (message.method === "ui/notifications/host-context-changed") {
        const context = message.params?.context as { theme?: string } | undefined;
        if (context?.theme) setTheme(context.theme);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  async function action(action: { tool?: string; args?: Record<string, unknown>; url?: string }) {
    if (action.tool) {
      const next = await send("tools/call", { name: action.tool, arguments: action.args ?? {} });
      if (next && typeof next === "object") setResult(next as EllieResult);
    } else if (action.url) await send("ui/open-link", { url: action.url });
  }
  return <main data-theme={theme} style={{ padding: 12 }}>
    {result?.card ? <Card card={result.card} onAction={(value) => void action(value)} /> : <p>Ellie card is waiting for the tool result.</p>}
    {result?.speech ? <p aria-live="polite">{result.speech}</p> : null}
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><McpCardApp /></React.StrictMode>);
