import { useEffect, useRef, useState, type ReactNode } from "react";
import { getOutbox, type OutboxMessage } from "../api.js";
export function Messages({ householdId, refreshKey, onOpen, onNewMessages }: { householdId: string; refreshKey: number; onOpen: (href: string) => void; onNewMessages: (count: number) => void }): ReactNode {
  const [messages, setMessages] = useState<OutboxMessage[]>([]);
  const [seen, setSeen] = useState(0);
  const previousIds = useRef<Set<string>>();
  const newMessagesCallback = useRef(onNewMessages);
  newMessagesCallback.current = onNewMessages;
  const [newestId, setNewestId] = useState<string>();
  useEffect(() => {
    let live = true;
    const load = async () => { try { const next = await getOutbox(householdId); if (live) { const ids = new Set(next.map((message) => message.id)); if (previousIds.current) { const added = next.filter((message) => !previousIds.current!.has(message.id)); if (added.length) { newMessagesCallback.current(added.length); setNewestId(added.at(-1)?.id); } } previousIds.current = ids; setMessages(next); setSeen(next.length); } } catch { if (live) setMessages([]); } };
    void load(); const timer = window.setInterval(() => void load(), 2000);
    return () => { live = false; window.clearInterval(timer); };
  }, [householdId, refreshKey]);
  return <div className="message-list" aria-label="Phone messages">{messages.length ? messages.map((message) => { let label = message.link; try { label = new URL(message.link!, window.location.origin).pathname.startsWith("/l/") ? "Open Headsup link" : message.link; } catch { /* retain the displayed link */ } return <article className={`sms-bubble${message.id === newestId ? " sms-bubble--new" : ""}`} key={message.id}><small>{message.channel.toUpperCase()} · {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.sentAt))}</small><p>{message.body}</p>{message.link ? <button className="sms-link" onClick={() => onOpen(message.link!)}>{label}</button> : null}</article>; }) : <div className="phone-empty"><span>✉</span><p>No messages yet</p><small>Phone handoffs will appear here.</small></div>}{seen > 0 ? <span className="sr-only" aria-live="polite">{seen} messages</span> : null}</div>;
}
