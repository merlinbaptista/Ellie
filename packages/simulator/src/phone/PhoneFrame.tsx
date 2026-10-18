import { useState, type ReactNode } from "react";
import { Messages } from "./Messages.js";
export function PhoneFrame({ householdId, refreshKey, browserUrl, onOpen, onCloseBrowser }: { householdId: string; refreshKey: number; browserUrl?: string; onOpen: (href: string) => void; onCloseBrowser: () => void }): ReactNode {
  const [tab, setTab] = useState<"messages" | "browser">(browserUrl ? "browser" : "messages");
  const [target, setTarget] = useState(browserUrl ?? "");
  const [unread, setUnread] = useState(0);
  function open(href: string) {
    const parsed = new URL(href, window.location.origin);
    if (parsed.origin === window.location.origin || parsed.pathname.startsWith("/l/") || parsed.pathname.startsWith("/phone/")) {
      setTarget(`${parsed.pathname}${parsed.search}${parsed.hash}`); setTab("browser"); onOpen(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    } else window.open(parsed.href, "_blank", "noopener,noreferrer");
  }
  return <section className="phone-panel" aria-label="Phone simulator"><header className="phone-hardware"><span className="phone-camera" /><span>Headsup's phone</span><button className="phone-close" onClick={onCloseBrowser} aria-label="Close phone browser">×</button></header><nav className="phone-tabs" aria-label="Phone tabs"><button aria-pressed={tab === "messages"} onClick={() => { setTab("messages"); setUnread(0); }}>Messages{unread ? <span className="unread-badge" aria-label={`${unread} unread`}>{unread}</span> : null}</button><button aria-pressed={tab === "browser"} onClick={() => setTab("browser")}>Browser</button></nav><div className="phone-content"><div hidden={tab !== "messages"}><Messages householdId={householdId} refreshKey={refreshKey} onOpen={open} onNewMessages={(count) => { if (tab !== "messages") setUnread((value) => value + count); }} /></div>{tab === "browser" ? target ? <iframe title="Phone browser" src={target} /> : <div className="phone-empty"><span>◎</span><p>Open a message link</p></div> : null}</div></section>;
}
