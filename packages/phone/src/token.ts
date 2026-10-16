export interface LinkClaims { v: number; hh: string; kind: "fix" | "booking" | "summary"; ref?: string; exp: number; nonce: string }
const sessionKey = "ellie.t";

export function captureToken(locationRef: Location = window.location, storage: Storage = window.sessionStorage, historyRef: History = window.history): string | null {
  const query = new URLSearchParams(locationRef.search);
  const incoming = query.get("t");
  const token = incoming || storage.getItem(sessionKey);
  if (incoming) {
    storage.setItem(sessionKey, incoming);
    query.delete("t");
    const search = query.toString();
    historyRef.replaceState(null, "", `${locationRef.pathname}${search ? `?${search}` : ""}${locationRef.hash}`);
  }
  return token;
}

export function readLinkClaims(token: string): LinkClaims | null {
  try {
    const body = token.split(".")[0];
    if (!body) return null;
    const base64 = body.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(body.length / 4) * 4, "=");
    return JSON.parse(atob(base64)) as LinkClaims;
  } catch { return null; }
}
export function clearToken(storage: Storage = window.sessionStorage): void { storage.removeItem(sessionKey); }
