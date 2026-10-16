import type { PhoneView } from "@ellie/schema";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export function renderPhonePage(view: PhoneView, token: string, notice?: string): string {
  const sections = view.sections.map((section) => {
    const listTag = section.ordered ? "ol" : "ul";
    const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
    const list = section.list ? `<${listTag}>${section.list.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</${listTag}>` : "";
    return `<section class="${escapeHtml(section.tone)}"><h2>${escapeHtml(section.heading)}</h2>${body}${list}</section>`;
  }).join("");
  const actions = view.actions.map((action) => action.method === "link" && action.url
    ? `<a class="button" href="${escapeHtml(action.url)}" rel="noopener noreferrer">${escapeHtml(action.label)}</a>`
    : `<form method="post" action="/api/phone/actions/${escapeHtml(action.id)}"><input type="hidden" name="t" value="${escapeHtml(token)}"><button type="submit">${escapeHtml(action.label)}</button></form>`).join("");
  return `<!doctype html><html lang="${escapeHtml(view.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(view.title)} - Ellie</title><style>body{font:16px system-ui,sans-serif;line-height:1.5;margin:0;background:#f5f7f4;color:#17231d}main{max-width:680px;margin:auto;padding:24px}header{border-bottom:1px solid #cbd5ce;padding-bottom:16px}h1{font-size:1.7rem;margin:.3em 0}h2{font-size:1.05rem;margin:0 0 .5em}section{padding:16px 0;border-bottom:1px solid #d8dfda}.warning{color:#7b3d00}.safety{color:#8d2018;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:10px;padding:20px 0}.button,button{display:inline-block;border:0;border-radius:4px;padding:12px 16px;background:#176b4d;color:white;text-decoration:none;font:inherit}form{margin:0}.notice{padding:12px;background:#e3eee8}</style></head><body><main><header><p>Ellie</p><h1>${escapeHtml(view.title)}</h1>${view.subtitle ? `<p>${escapeHtml(view.subtitle)}</p>` : ""}</header>${notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ""}${sections}<nav class="actions" aria-label="Actions">${actions}</nav><footer><small>Link expires ${escapeHtml(view.expiresAt)}</small></footer></main></body></html>`;
}
