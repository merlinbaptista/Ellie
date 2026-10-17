import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importJWK, SignJWT } from "jose";
import { loadEnv } from "../packages/server/src/config/env.js";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Development tokens are disabled in production.");
if (!env.DEV_OAUTH_PRIVATE_KEY) throw new Error("Set DEV_OAUTH_PRIVATE_KEY to a local private JWK file; the token is not generated.");
if (!env.OAUTH_ISSUER_URL) throw new Error("Set OAUTH_ISSUER_URL before creating a development token.");
const householdArg = process.argv.indexOf("--household");
const householdId = householdArg >= 0 ? process.argv[householdArg + 1] : env.DEFAULT_HOUSEHOLD_ID;
if (!householdId) throw new Error("Usage: npm run dev:token -- --household demo-blr");
const jwk = JSON.parse(await readFile(resolve(env.DEV_OAUTH_PRIVATE_KEY), "utf8")) as JsonWebKey;
const key = await importJWK(jwk, "RS256");
const audience = env.OAUTH_AUDIENCE ?? `${env.ELLIE_PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`;
const token = await new SignJWT({ [env.OAUTH_HOUSEHOLD_CLAIM]: householdId, scope: env.OAUTH_REQUIRED_SCOPES })
  .setProtectedHeader({ alg: "RS256", ...(jwk.kid ? { kid: jwk.kid } : {}) })
  .setIssuer(env.OAUTH_ISSUER_URL)
  .setAudience(audience)
  .setSubject(`dev:${householdId}`)
  .setIssuedAt()
  .setExpirationTime("10m")
  .sign(key);
console.log(token);
