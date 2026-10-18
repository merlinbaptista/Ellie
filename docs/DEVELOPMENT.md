# Headsup

Normal reminders remember a time. Headsup remembers your home.

**Status: Module 9: privacy and trust**

Headsup is a self-hosted MCP server that turns Alexa+ into a household memory agent. It records home events, predicts what is due from household history and region packs, diagnoses problems, and hands fixes or bookings to a phone.

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

The server connection is configured in [.vscode/mcp.json](.vscode/mcp.json). Start Headsup with `npm run dev`, then use Copilot Agent mode.

## Demo mode vs AWS mode

Each service uses mock mode by default. With `auto`, AWS is selected only when all required values are configured. DynamoDB and Bedrock have live adapters; notification and scheduling use mocks until Module 6.

| Service   | AWS requirements                                                                                       | Mock implementation          |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| storage   | `AWS_REGION`, `DYNAMODB_TABLE_NAME`, credentials                                                       | file-store (or memory-store) |
| llm       | `AWS_REGION`, `BEDROCK_MODEL_ID`, credentials                                                          | mock-llm                     |
| notifier  | `AWS_REGION`, SDK credentials, `SNS_TOPIC_ARN` or `SNS_SMS_ENABLED=true`                               | console-outbox               |
| scheduler | `AWS_REGION`, SDK credentials, `EVENTBRIDGE_TARGET_ARN`, `EVENTBRIDGE_ROLE_ARN`, `SCHEDULER_QUEUE_URL` | local-timer                  |

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

`send_to_phone` sends a consented fix, booking guide, or due summary with a short expiring link. Links use HMAC signatures and wall-clock expiry; SMS contains one GSM-7 link and is limited to 160 characters. The server-rendered `/p/:token` page remains a fallback; a production build also serves the mobile page at `/phone/`. The phone API rebuilds the view live and accepts token-scoped `fixed`, `not_fixed`, `booked`, and chat actions.

Flow: Alexa → `send_to_phone` → SMS/email → `/l/code` → phone guide → token-authenticated action.

Booking uses the saved household provider. A new item in a multi-provider region asks once; one-provider regions use their provider. The India starter list includes Indane's WhatsApp `REFILL` action and requires the registered phone number.

## Phone page

Build everything with `npm run build`; run the API and Vite page together with `npm run dev:all`. In development, set `PHONE_PAGE_BASE_URL=http://localhost:5174` in `.env` so short links use Vite's hot-reload page. The page moves the signed token from the query string into `sessionStorage` and sends it only as a Bearer header. Checked fix steps persist per diagnosis in local storage.

The shared `@ellie/ui` package renders phone views and MCP cards. Phone chat is available only for non-safety fix guides, runs the safety gate first, and answers from diagnosis evidence/fix-plan context. Chat is disabled after a safety hit. With mock drivers, labels localize to English, Hindi, Kannada, Tamil, and Spanish while repair content remains in English. Hindi, Kannada, Tamil, and Spanish starter labels are marked `reviewed: false` and need native-speaker review.

For an optional manual accessibility score, run Lighthouse in Chrome's mobile emulation against a signed phone link; automated axe checks cover the Fix, Booking, Summary, Error, and safety-only views.

Phone summary preview at 390 × 844:

![Headsup phone summary page](docs/phone-summary-390x844.png)

### Phone chat and languages

Chat answers only questions about the current repair, cites the supplied diagnosis or fix-plan context, and rejects unsupported facts or unsafe guidance. Safety-stop views never show chat. A safety hit during chat disables further messages. English, Hindi, Kannada, Tamil, and Spanish UI labels are available; translated repair content requires a configured LLM, otherwise the page clearly says the steps remain in English. Non-English starter labels need native-speaker review before production.

## MCP Apps

When the single-file card is built, supported hosts can render `ui://ellie/card.html` inline for due, prediction, history, diagnosis, and phone handoff tools. Text speech and structured results remain unchanged for Alexa+ and hosts without Apps support. The MCP Apps server helpers currently require MCP SDK v2, so Headsup registers the HTML resource and metadata directly on its MCP SDK v1 server; the compact embedded client remains under 150 KB.

## Demo with the simulator

Run `npm run dev` and open [http://127.0.0.1:8787/sim/](http://127.0.0.1:8787/sim/) in Chrome or Edge. The simulator opens on the seeded Bengaluru household; use the phrase chips to rehearse the two-intent change-and-diagnosis flow, follow-ups, phone handoff, and resolution. Voice recognition is browser-provided and may require microphone permission; typing and phrase chips always work. `npm run dev:all` runs the API, phone page and simulator Vite servers together for hot reload.

At a 1440 × 900 desktop viewport, the Echo Show and phone panels sit side by side. Select **The cylinder's changed and the purifier is beeping again** to see `log_event` followed by `diagnose`; the mock rehearsal returned two cards and took 104 ms total on the server (28 ms and 69 ms for the tool calls). Use the follow-up and phone-action chips to continue the same conversation. The screenshot capture could not be saved from this VS Code browser session; verify the layout in Chrome or Edge at 1440 × 900 when preparing external demo material.

Screenshots from the scripted rehearsal:

The image descriptions remain visible until the optional Chromium capture has generated the files.
![Simulator idle screen](docs/images/simulator-idle.png)
![Simulator two-intent result](docs/images/simulator-hero.png)
![Phone fix guide](docs/images/phone-fix.png)
![Phone booking guide](docs/images/phone-booking.png)

Regenerate them with `npm run screenshots` while the server is running. If Chromium is not installed, run `npx playwright install chromium` first. The script resets and restores the seeded households.

Routing uses the deterministic rules by default. Set `SIM_ROUTER=llm` to request Bedrock tool use, or keep `auto` to use Bedrock when the LLM driver resolves to it and fall back to deterministic routing on an error or timeout. The router only selects validated tools and arguments; spoken words come from MCP tool results. In production, the simulator is disabled unless `SIMULATOR_ENABLED=true` and `SIM_ACCESS_CODE` is at least 12 characters. Enter the code in the simulator unlock form; it is kept in session storage and sent in `x-sim-access-code` headers.

The **Host view** toggle loads the same `ui://ellie/card.html` resource used by MCP Apps inside a sandboxed iframe and compares it with the shared native card. Its local host bridge initializes the view and routes card tool actions back through simulator turns. A manual Lighthouse accessibility score is optional; automated axe checks cover the phone states and simulator main screen.

## Privacy and trust

Headsup stores household profile settings, items, events, predictions, diagnoses, resolutions, consent history, short-lived phone links, and queued messages. Ask “what do you know about my home?” for an inventory, use `forget_item` or `forget_household` to delete data with confirmation, and use the privacy phone page to download a JSON export, withdraw message consent, or erase the household. See [the privacy notice](docs/PRIVACY.md) for the full inventory and controls.

| Active driver         | Data shared                                                              | Purpose                        |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| All mock drivers      | Nothing leaves this computer                                             | Local development and demo     |
| DynamoDB              | Everything listed in the inventory                                       | Store home history             |
| Bedrock               | Item type, symptom, and history facts; no name, phone, email, or address | Explain problems and translate |
| SNS                   | Consented phone/email and message text                                   | Deliver messages               |
| EventBridge Scheduler | Job id and timing                                                        | Schedule reminders             |

| Data                                          | Retention                                                            |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Home history, items, predictions, resolutions | Until you delete it                                                  |
| Outbox messages                               | `OUTBOX_RETENTION_DAYS` (30 days by default)                         |
| Phone chat                                    | `CHAT_RETENTION_DAYS` (7 days) or link expiry, whichever comes first |
| Diagnosis sessions                            | 24 hours                                                             |
| Short links                                   | Link expiry (72 hours by default)                                    |
| Translation cache                             | 7 days                                                               |
| Privacy audit records                         | `AUDIT_RETENTION_DAYS` (365 days by default)                         |

Deleting data removes records and cancels schedules under Headsup's control. AWS-side SNS delivery logs, CloudWatch logs, and DynamoDB point-in-time backups are outside Headsup's control; backups kept by AWS expire on their own schedule.

### Connecting with OAuth

OAuth resource protection is optional and off by default. Set `OAUTH_ENABLED=true`, `OAUTH_ISSUER_URL`, `OAUTH_AUDIENCE`, and `OAUTH_JWKS_URL`; configure `OAUTH_REQUIRED_SCOPES` and the `OAUTH_HOUSEHOLD_CLAIM` as needed. Register `<ELLIE_PUBLIC_BASE_URL>/mcp` as the resource/audience with your authorization server and include the household claim in access tokens. Headsup validates issuer, audience, expiry, and scope but does not issue tokens or forward them to services. For Alexa+ account-linking steps, check the Alexa+ connector documentation.

## Go live on AWS

1. Set `LINK_SIGNING_SECRET` to at least 32 random characters and `NODE_ENV=production`.
2. Set `ELLIE_PUBLIC_BASE_URL` to a public HTTPS origin. Set up DynamoDB using the Module 3 stack.
3. Deploy `infra/ellie-messaging.yaml`, optionally setting `AlertEmail`, then run `npm run aws:env -- --stack ellie-messaging` and add the printed values to `.env`.
4. Attach `infra/iam-policy-messaging.json` after replacing its topic, role, and queue ARN placeholders.
5. New AWS accounts are in the SNS SMS sandbox; only verified destinations can receive SMS. India SMS generally requires DLT entity/template IDs (`SNS_SMS_ENTITY_ID`, `SNS_SMS_TEMPLATE_ID`). Topic-to-email subscription is the simplest demo path.
6. For a real reminder, use `POST /api/dev/schedule-test` in a non-production deployment and confirm the EventBridge schedule sends into SQS and reaches Headsup. The poller needs outbound AWS access; no public callback URL is required.

The messaging policy grants `sns:Publish` on `*` only for direct SMS because SNS has no per-phone-number resource ARN. Topic publishing remains restricted to the configured topic ARN.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
