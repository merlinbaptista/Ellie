import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { exportJWK, generateKeyPair } from "jose";
import { loadEnv } from "../packages/server/src/config/env.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("The development OAuth issuer is disabled in production.");

const port = Number(process.env.DEV_OAUTH_ISSUER_PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DEV_OAUTH_ISSUER_PORT must be a valid TCP port.");
const issuer = `http://127.0.0.1:${port}`;
const keyPath = resolve("data/dev-oauth-private.jwk");
await mkdir(resolve("data"), { recursive: true });
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const publicJwk = await exportJWK(publicKey);
const privateJwk = await exportJWK(privateKey);
publicJwk.kid = "ellie-dev-rs256";
publicJwk.alg = "RS256";
publicJwk.use = "sig";
privateJwk.kid = publicJwk.kid;
privateJwk.alg = "RS256";
privateJwk.use = "sig";
await writeFile(keyPath, JSON.stringify(privateJwk), { mode: 0o600 });

const app = express();
app.get("/.well-known/openid-configuration", (_req, res) => res.json({ issuer, jwks_uri: `${issuer}/jwks` }));
app.get("/jwks", (_req, res) => res.json({ keys: [publicJwk] }));
app.listen(port, "127.0.0.1", () => {
  console.log(`Headsup development OAuth issuer listening at ${issuer}`);
  console.log(`DEV_OAUTH_ISSUER_URL=${issuer}`);
  console.log(`DEV_OAUTH_JWKS_URL=${issuer}/jwks`);
  console.log(`DEV_OAUTH_PRIVATE_KEY=${keyPath}`);
});