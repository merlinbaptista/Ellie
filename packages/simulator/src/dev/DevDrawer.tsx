import { useState, type ReactNode } from "react";
import type { SimTurnResponse } from "@ellie/schema";
export function DevDrawer({ turns, open, onClose }: { turns: SimTurnResponse[]; open: boolean; onClose: () => void }): ReactNode {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  return <aside className="dev-drawer" aria-label="Developer drawer"><header><div><small>DEVELOPER TOOLS</small><h2>Turn trace</h2></div><button onClick={onClose} aria-label="Close developer drawer">×</button></header><button className="copy-json" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(turns, null, 2)).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy as JSON"}</button>{turns.slice(-10).reverse().map((turn) => <details key={turn.turnId}><summary>{turn.router.kind} · {turn.totalMs} ms · {turn.calls.length} calls</summary><pre>{JSON.stringify(turn, null, 2)}</pre></details>)}</aside>;
}
