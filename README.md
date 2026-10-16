# Ellie

Normal reminders remember a time. Ellie remembers your home.

**Status: Module 4: predictions and reminders**

Ellie is a self-hosted MCP server that turns Alexa+ into a household memory agent. It records home events, predicts what is due from household history and region packs, diagnoses problems, and hands fixes or bookings to a phone.

## Quick start

Requires Node.js 20 or newer (Node 22 LTS recommended).

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

In a second terminal:

```powershell
npm run smoke
```

## Connect with MCP Inspector

Run `npm run inspector`, choose **Streamable HTTP**, then connect to `http://127.0.0.1:8787/mcp`.

## Connect from VS Code Copilot

The server connection is configured in [.vscode/mcp.json](.vscode/mcp.json). Start Ellie with `npm run dev`, then use Copilot Agent mode.

## Demo mode vs AWS mode

Each service uses mock mode by default. With `auto`, AWS is selected only when all required values are configured. Module 1 still uses mocks for AWS-resolved services because real AWS adapters arrive in later modules.

| Service | AWS requirements | Mock implementation |
|---|---|---|
| storage | `AWS_REGION`, `DYNAMODB_TABLE_NAME`, credentials | file-store (or memory-store) |
| llm | `AWS_REGION`, `BEDROCK_MODEL_ID`, credentials | mock-llm |
| notifier | `AWS_REGION`, credentials, `SNS_TOPIC_ARN` or `SNS_SMS_ENABLED=true` | console-outbox |
| scheduler | `AWS_REGION`, `EVENTBRIDGE_TARGET_ARN`, `EVENTBRIDGE_ROLE_ARN`, credentials | local-timer |

Credentials are `AWS_PROFILE` or both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Project structure

- `packages/server`: TypeScript MCP server, adapters, HTTP API, tests
- `packages/schema`: browser-safe home-event schemas, region packs, and pure helpers
- `scripts`: end-to-end smoke client
- `docs`: module roadmap and development friction log
- `.vscode`: MCP server, launch, task, and editor configuration

## Region packs

`@ellie/schema` provides household entities, regional catalogs, matching, date and unit helpers, and shared tool contracts. Starter packs cover DEFAULT, India, the United States, and the United Kingdom. Review unverified starter facts before relying on them.

```powershell
npm run validate:packs
```

## Memory

The server stores each household in a single DynamoDB table using `pk` and `sk`; the default local path is the persistent file store. Household, item, alias, event, pending-question, and dedupe keys are centralized in `packages/server/src/data/keys.ts`.

The mock path seeds Bengaluru and Texas examples on startup when no demo households exist. Manage them explicitly with:

```powershell
npm run seed
npm run seed:reset
```

### DynamoDB Local

Docker is required for the optional local database:

```powershell
npm run db:local
```

Set `DYNAMODB_ENDPOINT=http://localhost:8000` and `DYNAMODB_TABLE_NAME=ellie-main` in `.env`, then create the table and seed it:

```powershell
npm run db:create
npm run seed:reset
```

### AWS DynamoDB

Deploy `infra/dynamodb-table.yaml` (or use `npm run db:create`), grant the policy in `infra/iam-policy-dynamodb.json`, and set `AWS_REGION`, `DYNAMODB_TABLE_NAME`, and either `AWS_PROFILE` or the standard AWS access-key environment variables. Remove `DYNAMODB_ENDPOINT` when switching from DynamoDB Local. The storage driver selects DynamoDB automatically when these values are present.

## Predictions

`predict_next` estimates recurring intervals from household events first, then falls back to the region catalog. Prediction rules apply delivery lead time, safety buffers, booking minimums, preferred service months, and a sanity clamp; each applied shift is included in the structured prediction. Confidence reflects interval count, consistency, and approximate dates. Components such as purifier filters are predicted only after an event tags that component.

`due_this_week` gives a household briefing. Reminder jobs use the local scheduler, are upserted by stable IDs, and are rechecked for stale history before an outbox message is sent. In development, rehearse reminders with MCP `ellie_dev_time_travel` or `POST /api/dev/time-travel`.

Prediction bases are household average, one observed interval, component default, region default, or user override. Status is computed live as `ok`, `due_soon`, `due`, `overdue`, or `unknown`.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
