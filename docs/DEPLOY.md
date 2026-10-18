# Headsup Deployment

## Local Container

Create `.env`, set a production-strength `LINK_SIGNING_SECRET`, keep the simulator disabled unless it has an access code, and run:

```powershell
npm run docker:up
```

Open `http://127.0.0.1:8787/health` and `http://127.0.0.1:8787/sim/` (the simulator is disabled in production by default). Runtime data is persisted in `./data`. Stop with `npm run docker:down`. DynamoDB Local is optional: `docker compose --profile local-db up -d dynamodb-local`.

## Public HTTPS Tunnel [YOU]

Choose one tunnel provider and install its client first.

Cloudflare quick tunnel:

```powershell
cloudflared tunnel --url http://localhost:8787
```

ngrok:

```powershell
ngrok http 8787
```

After the tunnel prints its HTTPS URL:

1. Set `ELLIE_PUBLIC_BASE_URL=https://<tunnel-host>` and leave `SHORT_LINK_BASE_URL` blank so it follows the public base URL.
2. The server's MCP host allow-list includes the configured public URL host; restart Headsup after updating `.env`.
3. Run `npm run preflight`, then ` $env:ELLIE_MCP_URL='https://<tunnel-host>/mcp'; npm run smoke`.
4. Open a short link on a real phone over mobile data.

Quick-tunnel URLs change after restart. Update `.env` each time, or use a named tunnel/fixed domain for the judging period. Do not expose the dev simulator in production without its access-code gate.

## AWS Go-Live [YOU]

Pick one AWS region that supports the Bedrock model you intend to use and configure all services for that region. Obtain the AWS CLI and configure a least-privilege role/profile before proceeding.

Deploy is dry-run by default and prints both commands. Review them, then pass `--yes` to execute:

```powershell
npm run aws:deploy -- --region us-east-1
npm run aws:deploy -- --region us-east-1 --alert-email you@example.com --yes
```

The helper deploys `infra/dynamodb-table.yaml` first and `infra/ellie-messaging.yaml` second. It uses the AWS CLI directly and never prints credentials. Create the IAM policy document with:

```powershell
npm run aws:policy
```

Review `infra/iam-policy-all.json`, replace the `REPLACE_WITH_*` resource placeholders, and attach the resulting policy to the server role. Enable the selected model in the Bedrock console. Then populate `.env` with `DYNAMODB_TABLE_NAME`, `AWS_REGION`, `BEDROCK_MODEL_ID`, `AWS_PROFILE` or workload credentials, and outputs from:

```powershell
npm run aws:env -- --stack ellie-messaging
npm run aws:check -- --bedrock
```

Seed DynamoDB, start the server, and confirm the startup banner reports the intended driver for storage, LLM, notifier, and scheduler. Run `npm run demo:check` and `npm run bench`, then confirm the SNS email subscription and reminder delivery. If a live service fails, switch only that driver back to mock and record it in `docs/friction-log.md` and the README limitations.

DynamoDB on-demand, SNS, and Scheduler costs should be modest at demo volume; Bedrock is billed per token. Keep `BEDROCK_MAX_TOKENS` low. After judging, review and delete stacks with the dry-run command below; `--yes` is required for deletion:

```powershell
npm run aws:destroy
npm run aws:destroy -- --yes
```

This project retains two local CloudFormation source templates. `npm run aws:deploy` is the combined deployment entry point and orders them; it does not create a nested-stack template with remote template URLs.

## Alexa+ Connection [YOU]

MCP URL: `https://<host>/mcp` (Streamable HTTP, protocol 2025-11-25).

Auth mode: none when OAuth is off; OAuth resource protection when Module 9 OAuth is configured.

### Availability, honestly

Per the [MCP Toolkit Overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html) (last modified 3 Aug 2026): *"The MCP Toolkit is available in the United States."* `addon.json` takes `storeListing.distributionCountries` as ISO country codes, with `["US"]` as the documented example. Access is additionally limited to selected partners, as raised by a participant on the hackathon forum. Headsup is developed from Bengaluru, so **a live Alexa+ device demo is not assumed**. The Alexa+ simulator at `/sim/` is the demo path and is presented as a simulator, never as a real Echo.

### Conformance against the official requirements

Built only from the [QuickStart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) (last modified 10 Jul 2026) and the [Overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html). ✅ = met and covered by a test; 🔑 = met in code but only provable with live credentials or access; 👤 = requires a human action.

| Official requirement (source) | Headsup | Evidence |
|---|---|---|
| Streamable HTTP; the deprecated standalone HTTP+SSE transport must not be used | ✅ | `POST /mcp` with `StreamableHTTPServerTransport`; `packages/server/test/mcp.integration.test.ts` initializes a real SDK client |
| MCP specification 2025-11-25 | ✅ | `mcp-protocol-version: 2025-11-25` asserted in `packages/server/test/oauth.test.ts` and the MCP integration suite |
| Follow the MCP Apps standard if you provide visuals | ✅ | MCP App view registered on five tools; `packages/server/test/mcp.apps.test.ts`. Text and `structuredContent` stay complete for hosts without UI |
| Server reachable at a remote URL; `cloudflared` is acceptable during development | 🔑 | `ELLIE_PUBLIC_BASE_URL` plus the tunnel section above. No public endpoint is currently running |
| 401 Unauthorized **without** a `WWW-Authenticate` header for unauthenticated requests | ✅ | **Module 9 did send one.** `ALEXA_MODE` now defaults to `true` and omits it; `packages/server/test/oauth.test.ts` tests both behaviours |
| Protected Resource Metadata document at its RFC 9728 well-known URI | ✅ | `GET /.well-known/oauth-protected-resource` returns `resource`, `authorization_servers`, `scopes_supported`, `bearer_methods_supported` |
| `scopes_supported` present in the PRM document | ✅ | Driven by `OAUTH_REQUIRED_SCOPES` (default `ellie.home`); asserted in the OAuth tests |
| Authorization server metadata at `/.well-known/oauth-authorization-server`, with `code_challenge_methods_supported` including `S256` | 👤 | **Served by the authorization server, not by Headsup.** Headsup is the resource server only. Whichever issuer `OAUTH_ISSUER_URL` names must publish this; `packages/server/src/auth/oauth.ts` already reads that path when resolving JWKS. Verify it before account linking: account linking will not proceed without `S256` |
| OAuth 2.1 authorization code flow with PKCE (S256) | 👤 | Same: the issuer's responsibility. Headsup verifies the resulting bearer token (issuer, audience, expiry, scope, household claim) |
| `resource` parameter set to the MCP server's canonical URI on the authorization and token requests | 👤 | Issuer/client responsibility. Headsup's canonical URI is `${ELLIE_PUBLIC_BASE_URL}/mcp` and is also the expected `aud`; a mismatched audience is rejected with 401 |
| Bearer token in the `Authorization` header, never in the query string | ✅ | `oauthMiddleware` only reads `Authorization: Bearer …`; `bearer_methods_supported` is `["header"]`. Separately, phone link tokens are stripped from the URL by `packages/phone/src/token.ts` |
| Not supported yet: DCR, CIMD, OIDC, step-up authorization | ✅ | Headsup uses none of them |
| Round-trip query response latency under 500 ms | ✅ (mock) / 🔑 (live) | `npm run bench`: all seven tools under 500 ms p95 on the mock path, highest 101 ms. Live AWS timings need `npm run bench -- --live`, which refuses to run while any driver is a mock |
| `addon.json`: descriptions, 3–4 example phrases, privacy policy URL, terms URL, six light icon sizes, one 600x900 carousel image | 👤 | Not authored. Requires an Alexa developer account and hosted HTTPS assets |
| Onboarding via `alexa-ai configure` / `alexa-ai new mcp` / `alexa-ai deploy` | 👤 | Requires US developer-account access to the Toolkit |

Two deliberate deviations are recorded in [friction-log.md](friction-log.md): the `WWW-Authenticate` difference between RFC 9728 and the Alexa+ QuickStart, and the US-only availability of the Toolkit.

### Steps, when access is granted

1. Install and authenticate the CLI: `alexa-ai configure` (Login with Amazon; credentials land in `~/.alexa-ai/credentials`; use `--no-browser` on a headless box).
2. Scaffold: `alexa-ai new mcp --name "Headsup" --locale en-US --mcp-server-url "https://<host>/mcp"`.
3. Fill `addon-package/addon.json`: `shortDescription` (≤123 chars), `fullDescription` (≤4000), 3–4 `examplePhrases` (≤200 each), `privacyAndCompliance` URLs, and `mediaAssets`.
4. Deploy to the development stage: `alexa-ai deploy`. Redeploy after **any** tool change — Alexa+ refreshes tool information only on deployment.
5. Test in the web simulator or on a device, then `alexa-ai submit` for certification.

After connecting, repeat rehearsal checklist rows 2–4 and 10 on a real device. If Alexa+ access is unavailable, the simulator demo stands on its own; disclose that in `docs/SUBMISSION.md`.
