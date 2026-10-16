import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PhoneLinkPayload, type PhoneLinkPayload as PhoneLinkPayloadType } from "@ellie/schema";
import type { Env } from "../config/env.js";

export type TokenError = "invalid" | "expired";
export class PhoneTokenError extends Error {
  constructor(public readonly reason: TokenError) { super(reason); this.name = "PhoneTokenError"; }
}

function signature(payloadPart: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadPart).digest();
}

export function signPhoneLink(input: { householdId: string; kind: PhoneLinkPayloadType["kind"]; ref?: string; env: Env }): { token: string; payload: PhoneLinkPayloadType; expiresAt: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = PhoneLinkPayload.parse({
    v: 1,
    hh: input.householdId,
    kind: input.kind,
    ...(input.ref ? { ref: input.ref } : {}),
    exp: nowSeconds + input.env.PHONE_LINK_TTL_HOURS * 60 * 60,
    nonce: randomBytes(8).toString("hex").slice(0, 10),
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${signature(encoded, input.env.LINK_SIGNING_SECRET).toString("base64url")}`, payload, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function verifyPhoneLink(token: string, env: Env, nowMs = Date.now()): PhoneLinkPayloadType {
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra !== undefined) throw new PhoneTokenError("invalid");
  let supplied: Buffer;
  let parsed: unknown;
  try {
    supplied = Buffer.from(signaturePart, "base64url");
    if (supplied.length !== 32 || supplied.toString("base64url") !== signaturePart) throw new Error("bad signature encoding");
    const expected = signature(payloadPart, env.LINK_SIGNING_SECRET);
    if (!timingSafeEqual(supplied, expected)) throw new Error("signature mismatch");
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    throw new PhoneTokenError("invalid");
  }
  const result = PhoneLinkPayload.safeParse(parsed);
  if (!result.success) throw new PhoneTokenError("invalid");
  if (result.data.exp <= Math.floor(nowMs / 1000)) throw new PhoneTokenError("expired");
  return result.data;
}
