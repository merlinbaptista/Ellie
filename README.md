# Ellie

Normal reminders remember a time. Ellie remembers your home.

**Status: Module 6: phone handoff and AWS scheduling**

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

Each service uses mock mode by default. With `auto`, AWS is selected only when all required values are configured. DynamoDB and Bedrock have live adapters; notification and scheduling use mocks until Module 6.

| Service | AWS requirements | Mock implementation |
|---|---|---|
| storage | `AWS_REGION`, `DYNAMODB_TABLE_NAME`, credentials | file-store (or memory-store) |
| llm | `AWS_REGION`, `BEDROCK_MODEL_ID`, credentials | mock-llm |
| notifier | `AWS_REGION`, SDK credentials, `SNS_TOPIC_ARN` or `SNS_SMS_ENABLED=true` | console-outbox |
| scheduler | `AWS_REGION`, SDK credentials, `EVENTBRIDGE_TARGET_ARN`, `EVENTBRIDGE_ROLE_ARN`, `SCHEDULER_QUEUE_URL` | local-timer |

AWS services use the AWS SDK default credential chain (`AWS_PROFILE`, shared SSO/credentials, environment credentials, or workload roles). Bedrock auto-selection requires `AWS_REGION` and `BEDROCK_MODEL_ID`; actual credentials are resolved by the SDK when Converse is called. DynamoDB auto-selection also requires its table and explicit profile or environment credentials unless using DynamoDB Local.

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

## Diagnosis

`diagnose` checks safety before item creation, then combines symptom history, component predictions, prior resolutions and warranty evidence. It asks at most one useful follow-up at a time. DIY steps and professional-only guidance come from region packs; safety-stop responses never include repair steps. `log_resolution` records the cause and fix, adds the appropriate service/change and cost events, and recomputes predictions.

The LLM may rank only the deterministic candidate list and explain cited evidence. Invalid citations, invented causes, uncited dates/numbers, or a low-confidence ranking fall back to deterministic speech. The voice path returns after `LLM_VOICE_TIMEOUT_MS` (350 ms by default); a separate bounded background call can refine the saved explanation. With `AWS_REGION`, `BEDROCK_MODEL_ID`, and credentials configured, `LLM_DRIVER=auto` selects Bedrock Converse. Credentials use the AWS SDK default provider chain; see [infra/iam-policy-bedrock.json](infra/iam-policy-bedrock.json). Guardrails are optional via `BEDROCK_GUARDRAIL_ID` and `BEDROCK_GUARDRAIL_VERSION`.

## Phone handoff

`send_to_phone` sends a consented fix, booking guide, or due summary with a short expiring link. Links use HMAC signatures and wall-clock expiry; SMS contains one GSM-7 link and is limited to 160 characters. The `/p/:token` server-rendered page is the fallback until the Module 7 phone page is configured. The phone API rebuilds the view live and accepts token-scoped `fixed`, `not_fixed`, and `booked` actions.

Flow: Alexa → `send_to_phone` → SMS/email → `/l/code` → phone guide → token-authenticated action.

Booking uses the saved household provider. A new item in a multi-provider region asks once; one-provider regions use their provider. The India starter list includes Indane's WhatsApp `REFILL` action and requires the registered phone number.

## Go live on AWS

1. Set `LINK_SIGNING_SECRET` to at least 32 random characters and `NODE_ENV=production`.
2. Set `ELLIE_PUBLIC_BASE_URL` to a public HTTPS origin. Set up DynamoDB using the Module 3 stack.
3. Deploy `infra/ellie-messaging.yaml`, optionally setting `AlertEmail`, then run `npm run aws:env -- --stack ellie-messaging` and add the printed values to `.env`.
4. Attach `infra/iam-policy-messaging.json` after replacing its topic, role, and queue ARN placeholders.
5. New AWS accounts are in the SNS SMS sandbox; only verified destinations can receive SMS. India SMS generally requires DLT entity/template IDs (`SNS_SMS_ENTITY_ID`, `SNS_SMS_TEMPLATE_ID`). Topic-to-email subscription is the simplest demo path.
6. For a real reminder, use `POST /api/dev/schedule-test` in a non-production deployment and confirm the EventBridge schedule sends into SQS and reaches Ellie. The poller needs outbound AWS access; no public callback URL is required.

The messaging policy grants `sns:Publish` on `*` only for direct SMS because SNS has no per-phone-number resource ARN. Topic publishing remains restricted to the configured topic ARN.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
