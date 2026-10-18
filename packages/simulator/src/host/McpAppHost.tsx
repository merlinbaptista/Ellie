import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card, type EllieCard } from "@ellie/ui";
import { getAppResource, type SimTurnResponse } from "../api.js";

interface Rpc { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> }
export function McpAppHost({ result, onToolCall, onOpen, onClose }: { result: SimTurnResponse; onToolCall: (name: string, args: Record<string, unknown>) => Promise<SimTurnResponse>; onOpen: (href: string) => void; onClose: () => void }): ReactNode {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState("Loading host resource");
  const resultRef = useRef(result);
  const initialized = useRef(false);
  const handlers = useRef({ onOpen, onToolCall });
  resultRef.current = result;
  handlers.current = { onOpen, onToolCall };
  function init(): void { frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { protocolVersion: "2026-01-26", appCapabilities: {} } }, "*"); }
  useEffect(() => { let active = true; void getAppResource().then((value) => { if (active) { setHtml(value); setBridgeStatus("Using minimal MCP Apps host bridge"); } }).catch(() => setBridgeStatus("MCP App resource unavailable")); return () => { active = false; }; }, []);
  useEffect(() => {
    const listener = (event: MessageEvent<Rpc>) => {
      if (event.source !== frame.current?.contentWindow || event.data?.jsonrpc !== "2.0") return;
      const message = event.data;
      if (message.method === "ui/initialize" && message.id !== undefined) {
        initialized.current = true;
        frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2026-01-26", capabilities: { tools: { call: true }, openLinks: true }, appInfo: { name: "Headsup simulator host", version: "0.1.0" } } }, "*");
      } else if (message.method === "ui/notifications/initialized") {
        initialized.current = true;
        frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { speech: resultRef.current.speech, card: resultRef.current.cards[0] } } }, "*");
        setBridgeStatus("MCP App initialised · tool result delivered");
      } else if (message.method === "tools/call" && message.id !== undefined) {
        const params = message.params ?? {};
        const name = String(params.name ?? "");
        const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
        void handlers.current.onToolCall(name, args).then((reply) => {
          frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: reply.speech }], structuredContent: { speech: reply.speech, card: reply.cards[0] } } }, "*");
          frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { speech: reply.speech, card: reply.cards[0] } } }, "*");
          setBridgeStatus(`Action ran: ${name}`);
        }).catch(() => setBridgeStatus(`Action failed: ${name}`));
      } else if (message.method === "ui/open-link" && message.id !== undefined) {
        const url = String(message.params?.url ?? ""); handlers.current.onOpen(url);
        frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, result: { opened: true } }, "*");
      }
    };
    window.addEventListener("message", listener);
    const initTimer = window.setInterval(() => {
      if (initialized.current) { window.clearInterval(initTimer); return; }
      init();
    }, 250);
    init();
    return () => { window.clearInterval(initTimer); window.removeEventListener("message", listener); };
  }, []);
  const nativeCard = result.cards[0] as EllieCard | undefined;
  return <section className="host-view" aria-label="MCP Apps host comparison"><header><div><small>HOST VIEW</small><h2>Native card / MCP App</h2></div><button onClick={onClose} aria-label="Close host view">×</button></header><div className="host-compare"><div className="host-native"><h3>Native</h3>{nativeCard ? <Card card={nativeCard} /> : <p>No card in this turn.</p>}</div><div className="host-frame"><h3>Sandboxed resource</h3>{html ? <iframe ref={frame} title="Sandboxed MCP Apps view" sandbox="allow-scripts" srcDoc={html} onLoad={init} /> : <p role="status">{bridgeStatus}</p>}</div></div><p className="host-status" role="status">{bridgeStatus}</p></section>;
}
