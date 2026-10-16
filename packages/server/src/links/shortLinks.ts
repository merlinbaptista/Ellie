import { randomInt } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import type { AppContext } from "../context.js";
import { verifyPhoneLink } from "./sign.js";
import { linkPk, shortLinkSk } from "../data/keys.js";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
export interface ShortLinkRecord { token: string; householdId: string; kind: "fix" | "booking" | "summary"; createdAt: string }

function makeCode(): string {
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function createShortLink(ctx: AppContext, input: { token: string; householdId: string; kind: ShortLinkRecord["kind"]; exp: number }): Promise<{ code: string; url: string }> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const code = makeCode();
    if (await ctx.storage.get(linkPk(), shortLinkSk(code))) continue;
    const record: ShortLinkRecord = { token: input.token, householdId: input.householdId, kind: input.kind, createdAt: ctx.clock.now().toISOString() };
    await ctx.storage.put({ pk: linkPk(), sk: shortLinkSk(code), type: "phone-short-link", data: { ...record }, ttl: input.exp });
    const base = ctx.env.SHORT_LINK_BASE_URL ?? ctx.env.ELLIE_PUBLIC_BASE_URL;
    return { code, url: `${base.replace(/\/$/, "")}/l/${code}` };
  }
  throw new Error("Could not allocate a unique short-link code");
}

export async function getShortLink(ctx: AppContext, code: string): Promise<ShortLinkRecord | null> {
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(code)) return null;
  const row = await ctx.storage.get(linkPk(), shortLinkSk(code));
  if (!row) return null;
  try {
    verifyPhoneLink(String(row.data.token), ctx.env);
    return row.data as unknown as ShortLinkRecord;
  } catch {
    await ctx.storage.delete(linkPk(), shortLinkSk(code));
    return null;
  }
}

export async function deleteForHousehold(ctx: AppContext, householdId: string): Promise<number> {
  const rows = await ctx.storage.query(linkPk());
  const owned = rows.filter((row) => row.type === "phone-short-link" && row.data.householdId === householdId);
  await Promise.all(owned.map((row) => ctx.storage.delete(linkPk(), row.sk)));
  return owned.length;
}

export function registerShortLinkRoutes(app: Express, ctx: AppContext): void {
  let checkedAt = 0;
  let pageReachable = false;
  app.get("/l/:code", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const record = await getShortLink(ctx, code ?? "");
      if (!record) { res.status(404).type("text/plain").send("This link is unavailable. Ask Alexa to send it again."); return; }
      if (Date.now() - checkedAt >= 60_000) {
        checkedAt = Date.now();
        try {
          const response = await fetch(ctx.env.PHONE_PAGE_BASE_URL, { method: "HEAD", signal: AbortSignal.timeout(1000) });
          pageReachable = response.ok;
        } catch { pageReachable = false; }
      }
      const destination = pageReachable
        ? `${ctx.env.PHONE_PAGE_BASE_URL.replace(/\/$/, "")}/?t=${encodeURIComponent(record.token)}`
        : `/p/${encodeURIComponent(record.token)}`;
      res.redirect(302, destination);
    } catch (error) { next(error); }
  });
}
