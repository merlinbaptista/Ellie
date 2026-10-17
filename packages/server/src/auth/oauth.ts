import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextFunction, Request, Response } from "express";
import type { AppContext } from "../context.js";
import { auditPk, auditSk } from "../data/keys.js";
import { householdFromToken } from "./householdFromToken.js";
import { withAuthIdentity } from "./identity.js";

const jwksUrlCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const jwksResolution = new Map<string, Promise<ReturnType<typeof createRemoteJWKSet>>>();
async function remoteKeys(ctx: AppContext): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const issuer = ctx.env.OAUTH_ISSUER_URL!;
  const configured = ctx.env.OAUTH_JWKS_URL;
  const key = configured ?? issuer;
  const cached = jwksUrlCache.get(key);
  if (cached) return cached;
  let pending = jwksResolution.get(key);
  if (!pending) {
    pending = (async () => {
      let url = configured;
      if (!url) {
        const base = issuer.replace(/\/$/, "");
        let metadata: { jwks_uri?: string } | undefined;
        for (const path of ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"]) {
          try {
            const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(3000) });
            if (response.ok) { metadata = await response.json() as { jwks_uri?: string }; if (metadata.jwks_uri) break; }
          } catch { /* try the next standard discovery document */ }
        }
        url = metadata?.jwks_uri;
      }
      if (!url) throw new Error("OAuth JWKS URL is not configured or discoverable");
      const keys = createRemoteJWKSet(new URL(url));
      jwksUrlCache.set(key, keys);
      return keys;
    })();
    jwksResolution.set(key, pending);
  }
  try { return await pending; } finally { jwksResolution.delete(key); }
}

function resourceUrl(ctx: AppContext): string { return `${ctx.env.ELLIE_PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`; }
function challenge(ctx: AppContext, error?: string): string {
  const metadata = `${ctx.env.ELLIE_PUBLIC_BASE_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}"${error ? `, error="${error}"` : ""}`;
}
async function auditFailure(ctx: AppContext, reason: string): Promise<void> {
  const at = ctx.clock.now().toISOString();
  await ctx.storage.put({ pk: auditPk(), sk: auditSk("unknown", at, randomUUID()), type: "privacy-audit", data: { action: "oauth_sign_in_failed", reason }, ttlClock: "wall", ttl: Math.floor(Date.now() / 1000) + ctx.env.AUDIT_RETENTION_DAYS * 86400 }).catch(() => undefined);
}

export function oauthMiddleware(ctx: AppContext) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!ctx.env.OAUTH_ENABLED) { next(); return; }
    const raw = req.header("authorization");
    const token = raw?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!token) { res.setHeader("WWW-Authenticate", challenge(ctx)); res.status(401).json({ error: "invalid_token" }); return; }
    try {
      const issuer = ctx.env.OAUTH_ISSUER_URL;
      if (!issuer) throw new Error("OAuth issuer is not configured");
      const audience = ctx.env.OAUTH_AUDIENCE ?? resourceUrl(ctx);
      const verified = await jwtVerify(token, await remoteKeys(ctx), { issuer, audience, clockTolerance: 60 });
      const scopes = typeof verified.payload.scope === "string" ? verified.payload.scope.split(/\s+/) : Array.isArray(verified.payload.scp) ? verified.payload.scp.filter((scope): scope is string => typeof scope === "string") : [];
      const required = ctx.env.OAUTH_REQUIRED_SCOPES.split(/\s+/).filter(Boolean);
      if (!required.every((scope) => scopes.includes(scope))) {
        res.setHeader("WWW-Authenticate", challenge(ctx, "insufficient_scope"));
        res.status(403).json({ error: "insufficient_scope", scope: required.join(" ") });
        return;
      }
      const householdId = await householdFromToken(ctx, verified.payload as JWTPayload);
      const subject = typeof verified.payload.sub === "string" ? verified.payload.sub : "unknown";
      withAuthIdentity({ householdId, subject }, next);
    } catch (error) {
      await auditFailure(ctx, error instanceof Error ? error.name : "invalid_token");
      res.setHeader("WWW-Authenticate", challenge(ctx, "invalid_token"));
      res.status(401).json({ error: "invalid_token" });
    }
  };
}

export function protectedResourceMetadata(ctx: AppContext) {
  return {
    resource: resourceUrl(ctx),
    authorization_servers: ctx.env.OAUTH_ISSUER_URL ? [ctx.env.OAUTH_ISSUER_URL] : [],
    scopes_supported: ctx.env.OAUTH_REQUIRED_SCOPES.split(/\s+/).filter(Boolean),
    bearer_methods_supported: ["header"],
  };
}
