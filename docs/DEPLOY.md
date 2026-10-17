# Ellie Deployment

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
2. The server's MCP host allow-list includes the configured public URL host; restart Ellie after updating `.env`.
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

Follow the official Alexa+ MCP/hackathon connector documentation. Copilot has not verified the connector's current console steps.

Steps from the official connector documentation:

-
-
-

After connecting, repeat rehearsal checklist rows 2–4 and 10 on a real device. If Alexa+ access is unavailable, the simulator demo stands on its own; disclose that in `docs/SUBMISSION.md`.
