import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed/seed.js";
import { closeAllSessions } from "../src/mcp/transport.js";
import { subjectPk } from "../src/data/keys.js";
import { createTestContext } from "./helpers.js";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterAll(async () => { await closeAllSessions(); await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

function listen(app: express.Express): Promise<string> {
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  return once(server, "listening").then(() => `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
}

describe("OAuth protected resource", () => {
  it("omits WWW-Authenticate from 401 responses by default, as the Alexa+ QuickStart requires", async () => {
    const ctx = await createTestContext();
    ctx.env = { ...ctx.env, ELLIE_PUBLIC_BASE_URL: "http://127.0.0.1:8787", OAUTH_ENABLED: true, OAUTH_ISSUER_URL: "https://issuer.example", OAUTH_AUDIENCE: "http://127.0.0.1:8787/mcp" };
    expect(ctx.env.ALEXA_MODE).toBe(true);
    const base = await listen(createApp(ctx));

    const denied = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBeNull();

    // The discovery path Alexa+ does use must still work without the header.
    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource`).then((response) => response.json()) as { resource: string; scopes_supported: string[] };
    expect(metadata.resource).toBe("http://127.0.0.1:8787/mcp");
    expect(metadata.scopes_supported).toContain("ellie.home");
  });

  it("keeps development endpoints disabled in production even when OAuth is enabled", async () => {
    const ctx = await createTestContext();
    ctx.env = { ...ctx.env, NODE_ENV: "production", OAUTH_ENABLED: true };
    const base = await listen(createApp(ctx));
    const seed = await fetch(`${base}/api/dev/seed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reset: true }) });
    expect(seed.status).toBe(404);
  });

  it("publishes metadata, challenges missing tokens, and binds the MCP household to verified claims", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    let issuer = "";
    const issuerApp = express().get("/.well-known/openid-configuration", (_req, res) => res.json({ jwks_uri: `${issuer}/jwks` })).get("/jwks", (_req, res) => res.json({ keys: [jwk] }));
    issuer = await listen(issuerApp);
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    ctx.env = { ...ctx.env, ELLIE_PUBLIC_BASE_URL: "http://127.0.0.1:8787", OAUTH_ENABLED: true, OAUTH_ISSUER_URL: issuer, OAUTH_JWKS_URL: `${issuer}/jwks`, OAUTH_AUDIENCE: "http://127.0.0.1:8787/mcp", OAUTH_REQUIRED_SCOPES: "ellie.home", ALEXA_MODE: false };
    const app = createApp(ctx);
    const base = await listen(app);
    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource`).then((response) => response.json()) as { resource: string; scopes_supported: string[] };
    expect(metadata.resource).toBe("http://127.0.0.1:8787/mcp");
    expect(metadata.scopes_supported).toEqual(["ellie.home"]);
    const denied = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(denied.status).toBe(401);
    // ALEXA_MODE is false here, so the RFC 9728 challenge header is present for standard MCP clients.
    expect(denied.headers.get("www-authenticate")).toContain("oauth-protected-resource");

    const tokenFor = (scope: string, audience = metadata.resource, expiration = "2m", tokenIssuer = issuer, householdClaim: string | null = "demo-blr") => new SignJWT({ scope, ...(householdClaim ? { ellie_household: householdClaim } : {}) }).setProtectedHeader({ alg: "RS256" }).setIssuer(tokenIssuer).setAudience(audience).setSubject("test-subject").setIssuedAt().setExpirationTime(expiration).sign(privateKey);
    const insufficient = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await tokenFor("profile")}` }, body: "{}" });
    expect(insufficient.status).toBe(403);
    expect(insufficient.headers.get("www-authenticate")).toContain("insufficient_scope");
    const wrongAudience = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await tokenFor("ellie.home", "https://other.example/mcp")}` }, body: "{}" });
    expect(wrongAudience.status).toBe(401);
    const wrongIssuer = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await tokenFor("ellie.home", metadata.resource, "2m", "https://wrong-issuer.example")}` }, body: "{}" });
    expect(wrongIssuer.status).toBe(401);
    const expiredToken = await new SignJWT({ scope: "ellie.home", ellie_household: "demo-blr" }).setProtectedHeader({ alg: "RS256" }).setIssuer(issuer).setAudience(metadata.resource).setSubject("expired-subject").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 180).sign(privateKey);
    const expired = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${expiredToken}` }, body: "{}" });
    expect(expired.status).toBe(401);

    const token = await tokenFor("ellie.home");
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" };
    const initialized = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "privacy-test", version: "1" } } }) });
    expect(initialized.status).toBe(200);
    const sessionId = initialized.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const response = await fetch(`${base}/mcp`, { method: "POST", headers: { ...headers, "mcp-session-id": sessionId! }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_history", arguments: { householdId: "demo-tx", item: "propane tank" } } }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("I can only see your own home.");

    const mappedToken = await tokenFor("ellie.home", metadata.resource, "2m", issuer, null);
    const mappedHeaders = { authorization: `Bearer ${mappedToken}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" };
    const mappedInitialize = await fetch(`${base}/mcp`, { method: "POST", headers: mappedHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "sub-mapping-test", version: "1" } } }) });
    expect(mappedInitialize.status).toBe(200);
    const mappedSession = mappedInitialize.headers.get("mcp-session-id");
    expect(mappedSession).toBeTruthy();
    const mappedResponse = await fetch(`${base}/mcp`, { method: "POST", headers: { ...mappedHeaders, "mcp-session-id": mappedSession! }, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_history", arguments: {} } }) });
    expect(mappedResponse.status).toBe(200);
    expect(await ctx.storage.query(subjectPk())).toHaveLength(1);
  });
});
