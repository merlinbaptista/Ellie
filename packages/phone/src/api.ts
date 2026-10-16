import type { ChatMessage, PhoneChatRequest, PhoneChatResponse, PhoneView } from "@ellie/schema";

export class PhoneApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) { super(message); this.name = "PhoneApiError"; }
}
async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  } catch { throw new PhoneApiError(0, "You're offline. Check your connection and try again.", "offline"); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
    throw new PhoneApiError(response.status, body.message ?? body.error ?? "The request could not be completed.", body.error);
  }
  return response.json() as Promise<T>;
}
export function getPhoneView(token: string, lang = "en"): Promise<PhoneView> { return request(`/api/phone/view?lang=${encodeURIComponent(lang)}`, token); }
export function postPhoneAction<T = { ok: boolean; nextDue?: string; view?: string }>(token: string, action: "fixed" | "not_fixed" | "booked"): Promise<T> {
  return request(`/api/phone/actions/${action}`, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
}
export function postChat(token: string, body: PhoneChatRequest): Promise<PhoneChatResponse> {
  return request("/api/phone/chat", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
export function getChat(token: string): Promise<{ messages: ChatMessage[]; disabled: boolean }> { return request("/api/phone/chat", token); }
