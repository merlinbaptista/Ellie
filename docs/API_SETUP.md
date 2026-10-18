# API setup

Ellie runs with an **empty `.env`**. Every external service has a working mock, every test passes without credentials, and the demo is reproducible offline. This document is only for the optional live path.

Work top to bottom: later services depend on earlier ones. After each section, run its verify command before moving on.

```powershell
Copy-Item .env.example .env   # once
npm run keys:check            # which services are CONFIGURED / MISSING / MALFORMED
npm run aws:check             # do the configured services actually answer
npm run preflight             # zero CODE problems; CREDENTIAL gaps are expected until the end
```

`keys:check` never prints a secret — values are shown as the first four characters plus `…`. Add `--verbose` for a per-key breakdown.

> **Costs.** Every figure is on the linked official pricing page. No price is reproduced here, because prices change and a wrong number in a repository is worse than no number. Check the page for your region before you enable anything.
> **Teardown.** Every section ends with how to remove what it created. Run all of them after **20 Nov 2026**.

---

## 0. AWS account safety (do this first)

Nothing below is safe without these two.

| Step | Where |
|---|---|
| Enable MFA on the root user, then stop using the root user | [Root user MFA](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_enable.html) |
| Create a zero-spend or small budget with an e-mail alert | [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html) |
| Turn on Cost Anomaly Detection | [Cost Anomaly Detection](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html) |

Pricing entry point: <https://aws.amazon.com/pricing/>. Free-tier terms: <https://aws.amazon.com/free/>.

**Verify:** the Billing console shows the budget, and signing in as root prompts for MFA.
**Teardown:** delete the budget; keep MFA.

---

## 1. IAM (least privilege)

**What it's for.** Ellie signs every AWS call. Give it exactly the actions it uses and nothing else.

**Steps**

1. Create an IAM user (or role) named `ellie-dev`: [Create an IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html).
2. Attach the repository policy. `infra/iam-policy-all.json` is the whole set; `infra/iam-policy-dynamodb.json`, `-bedrock.json` and `-messaging.json` split it per service. `npm run aws:policy` prints the policy for review.
3. Create an access key for programmatic access only: [Manage access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html). Prefer a named profile over keys in `.env` if you already use the AWS CLI.

**`.env`**

```
AWS_REGION=              # for example ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=       # only for temporary credentials
AWS_PROFILE=             # alternative to the two keys above
```

`AWS_SESSION_TOKEN` and `AWS_PROFILE` are read by the AWS SDK's provider chain, not by Ellie's own code.

**Verify:** `npm run keys:check` → `AWS credentials  ✔ CONFIGURED`.
**Cost:** IAM is free — see <https://aws.amazon.com/iam/>.
**Fallback:** leave blank. Every driver resolves to its mock and `GET /api/status` reports `mock` for each one.
**Teardown:** deactivate then delete the access key, then delete the user.

---

## 2. Bedrock

**What it's for.** Ranking diagnosis causes (the LLM may only re-order causes Ellie computed and cite evidence IDs Ellie supplied), routing simulator utterances, and translating phone copy. Ellie never sends a household id, contact detail, region or household-specific item name to Bedrock.

**Steps**

1. Pick a region that offers the model you want: [Model support by region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html).
2. Request model access in that region: [Model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html). Access is per account **and** per region.
3. Copy the model id or inference profile id: [Supported models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html).
4. Optional: create a guardrail and note its id and version: [Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html).

**`.env`**

```
BEDROCK_MODEL_ID=
BEDROCK_MAX_TOKENS=600
BEDROCK_TIMEOUT_MS=8000       # hard cap on every Converse call
BEDROCK_GUARDRAIL_ID=
BEDROCK_GUARDRAIL_VERSION=
LLM_VOICE_TIMEOUT_MS=350      # speak the deterministic answer after this
LLM_BACKGROUND_TIMEOUT_MS=8000
```

**Verify:** `npm run aws:check -- --only=bedrock --bedrock`. The `--bedrock` flag is required because this check is the only billable one: it sends a five-token `Converse` ping. Expected: `Bedrock  ✔ PASS`.
**Cost:** per input/output token — <https://aws.amazon.com/bedrock/pricing/>.
**Fallback:** leave `BEDROCK_MODEL_ID` blank. Ellie uses the mock LLM; diagnosis still works because scoring, evidence and fix plans are deterministic. On a timeout or a rejected answer the deterministic result is spoken and `bedrock.timeout_fallback` is logged.
**Teardown:** delete the guardrail. Model access costs nothing while idle; there is nothing to delete.

---

## 3. DynamoDB

**What it's for.** Households, items, events, predictions, diagnosis sessions, schedules and audit records. One table, single-table design; keys are built only in `packages/server/src/data/keys.ts`.

**Steps**

1. Create the table from the template: `npm run aws:deploy` (which applies `infra/dynamodb-table.yaml`), or create it by hand following [Create a table](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/getting-started-step-1.html). `npm run db:create` is the script path.
2. Read the generated name back with `npm run aws:env` if you used CloudFormation.
3. Seed: `npm run seed:reset`.

**`.env`**

```
DYNAMODB_TABLE_NAME=
DYNAMODB_ENDPOINT=       # only for DynamoDB Local
```

**Verify:** `npm run aws:check -- --only=dynamodb` → `DynamoDB  ✔ PASS` (a read-only `DescribeTable`).
**Cost:** on-demand capacity plus storage — <https://aws.amazon.com/dynamodb/pricing/>.
**Fallback:** leave blank. `MOCK_STORAGE_MODE=file` keeps everything in `data/ellie-store.json`; `memory` keeps it in RAM. For a local AWS-shaped check, run DynamoDB Local with `npm run db:local` and set `DYNAMODB_ENDPOINT=http://localhost:8000` (needs Docker).
**Teardown:** `npm run aws:destroy`, or delete the table in the console. Deleting the table deletes all household data.

---

## 4. EventBridge Scheduler

**What it's for.** Firing one reminder at a household's local time. Schedules are one-off and have deterministic ids, so re-running is an upsert, not a duplicate. The `SCHEDULE` records in DynamoDB are the source of truth; EventBridge only triggers, and the fire handler rechecks staleness before anything is sent.

**Steps**

1. Create a schedule group: [Schedule groups](https://docs.aws.amazon.com/scheduler/latest/UserGuide/managing-schedule-group.html).
2. Create the SQS target queue and the execution role that lets Scheduler write to it: [Execution role](https://docs.aws.amazon.com/scheduler/latest/UserGuide/setting-up.html#setting-up-execution-role). `infra/ellie-messaging.yaml` creates the group, queue and role together.

**`.env`**

```
EVENTBRIDGE_SCHEDULE_GROUP=ellie
EVENTBRIDGE_TARGET_ARN=      # arn:aws:sqs:<region>:<account>:<queue>
EVENTBRIDGE_ROLE_ARN=        # arn:aws:iam::<account>:role/<role>
SCHEDULER_QUEUE_URL=
SCHEDULER_POLL_WAIT_SEC=20
```

**Verify:** `npm run aws:check -- --only=eventbridge` then `--only=sqs`. Both should report `✔ PASS`.
**Cost:** per schedule invocation — <https://aws.amazon.com/eventbridge/pricing/> and <https://aws.amazon.com/sqs/pricing/>.
**Fallback:** leave blank. The mock scheduler keeps schedules in the store and `/api/dev/time-travel` fires them, which is how the demo shows a reminder without waiting a month.
**Teardown:** delete every schedule in the group, then the group, the queue and the role. `npm run aws:destroy` removes the stack.

---

## 5. SNS (SMS, with e-mail as the fallback)

**What it's for.** Delivering the phone handoff: one GSM-7 message, at most 160 characters, with exactly one signed link. Nothing is sent without stored consent, and contacts are masked in logs and tool results.

**Read these before enabling SMS — the rules change:**

- [Using the Amazon SNS SMS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html): new accounts start in the sandbox. You may send only to **verified destination numbers**, at most **10** of them, and a number can only be deleted at least **24 hours** after verification or the last verification attempt.
- [Adding and verifying phone numbers](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-verifying-phone-numbers.html).
- [Moving out of the sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-moving-to-production.html) — requires a support case.
- [SMS spend limits](https://docs.aws.amazon.com/sns/latest/dg/channels-sms-awssupport-spend-threshold.html): set the account monthly limit **before** your first send.
- [Sender IDs](https://docs.aws.amazon.com/sns/latest/dg/channels-sms-originating-identities-sender-ids.html): SNS now delivers SMS through [AWS End User Messaging SMS](https://docs.aws.amazon.com/sms-voice/latest/userguide/what-is-service.html). Some countries require a pre-registered sender ID and company registration — check [supported countries and regions](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html) for India before assuming an Indian number will receive anything.
- **India specifically:** India requires registration with the regulator (TRAI's DLT regime) and a registered sender ID, entity id and template id. Confirm the current requirement on the country page above; do not rely on this paragraph. `SNS_SMS_SENDER_ID`, `SNS_SMS_ENTITY_ID` and `SNS_SMS_TEMPLATE_ID` exist for exactly these values.

**`.env`**

```
SNS_TOPIC_ARN=
SNS_SMS_ENABLED=false       # keep false until the sandbox and spend limit are sorted
SNS_SMS_SENDER_ID=
SNS_SMS_ENTITY_ID=          # India DLT
SNS_SMS_TEMPLATE_ID=        # India DLT
SNS_SMS_TYPE=Transactional
PHONE_SEND_LIMIT_PER_HOUR=10
```

**Verify:** `npm run aws:check -- --only=sns` → `SNS  ✔ PASS` (`GetTopicAttributes`, read-only, free). Real delivery is only proven by sending to a verified number.
**Cost:** per message, varying by destination country — <https://aws.amazon.com/sns/pricing/> and <https://aws.amazon.com/end-user-messaging/pricing/>.
**Fallback:** leave blank. The mock notifier writes to the outbox, which the simulator's phone panel renders — this is the demo path and it is labelled as a mock. If SMS to India is blocked, use the **e-mail** channel instead: consent is recorded the same way and the same signed link is delivered.
**Teardown:** delete the topic and any subscriptions; release any sender id; remove verified sandbox numbers after their 24-hour window.

---

## 6. Public HTTPS URL (Cloudflare Tunnel or ngrok)

**What it's for.** A phone must be able to open the fix link, and the Alexa+ QuickStart requires the MCP server to be reachable at a remote URL (it names `cloudflared` as acceptable during development).

**Steps**

1. Install `cloudflared`: [Downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Quick tunnel for a demo: `cloudflared tunnel --url http://127.0.0.1:8787` — [Try Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). For a stable hostname, create a named tunnel: [Create a tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/).
3. Alternative: ngrok — [Getting started](https://ngrok.com/docs/getting-started/).
4. Put the HTTPS URL in `.env` and restart the server; signed links are built from it.

**`.env`**

```
ELLIE_PUBLIC_BASE_URL=https://<host>
SHORT_LINK_BASE_URL=          # optional, if the short domain differs
PHONE_PAGE_BASE_URL=          # optional, blank uses the built-in /phone/ bundle
CORS_ORIGINS=https://<host>
LINK_SIGNING_SECRET=          # at least 32 characters, not the placeholder
PHONE_LINK_TTL_HOURS=72
```

Generate the secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

**Verify:** `npm run preflight` reports a valid HTTPS public base URL and a non-default signing secret; open `https://<host>/health` from a phone.
**Cost:** Cloudflare Tunnel — <https://www.cloudflare.com/plans/>; ngrok — <https://ngrok.com/pricing>.
**Fallback:** `http://localhost:8787`. The simulator opens the phone page in a same-origin frame, so the whole handoff is demonstrable with no tunnel at all.
**Teardown:** stop `cloudflared`; delete the named tunnel and its DNS record.

---

## 7. OAuth 2.1 (optional)

**What it's for.** Scoping a connection to one household. With OAuth on, the household comes from the verified token and a differing `householdId` argument is refused.

Ellie is the **resource server** only. The authorization server is yours to provide, and it must publish `/.well-known/oauth-authorization-server` with `S256` in `code_challenge_methods_supported`, or Alexa+ account linking will not proceed. See the conformance table in [DEPLOY.md](DEPLOY.md).

**`.env`**

```
OAUTH_ENABLED=false
OAUTH_ISSUER_URL=
OAUTH_AUDIENCE=             # usually ${ELLIE_PUBLIC_BASE_URL}/mcp
OAUTH_JWKS_URL=             # optional override; otherwise discovered from the issuer
OAUTH_HOUSEHOLD_CLAIM=ellie_household
OAUTH_REQUIRED_SCOPES=ellie.home
ALEXA_MODE=true             # omit WWW-Authenticate from 401s, per the Alexa+ QuickStart
```

**Verify:** run the bundled development issuer with `npm run dev:issuer`, mint a token with `npm run dev:token`, then `npm run oauth:live-check` with `ELLIE_OAUTH_TEST_TOKEN` set. `GET /.well-known/oauth-protected-resource` must return `resource` and `scopes_supported`.
**Cost:** none from Ellie; depends on your issuer.
**Fallback:** `OAUTH_ENABLED=false`. The simulator and phone page both work without it.
**Teardown:** set `OAUTH_ENABLED=false`; revoke any issued client.

---

## 8. Alexa+

Full requirements, the conformance table and the onboarding steps are in [DEPLOY.md](DEPLOY.md#alexa-connection-you).

Short version: the MCP Toolkit is **available in the United States** and limited to selected partners, so this path may simply be unavailable to you. The simulator at `/sim/` is the demo path and is always labelled as a simulator.

**`.env`:** only `ELLIE_PUBLIC_BASE_URL` and the OAuth block above.
**Verify:** `alexa-ai deploy` returns an add-on id, and the web simulator invokes a tool.
**Cost:** an Amazon developer account is free — <https://developer.amazon.com/>.
**Fallback:** the Ellie simulator.
**Teardown:** delete the add-on from the [developer console](https://developer.amazon.com/alexa/console/ask/addons).

---

## 9. GitHub

**What it's for.** The judged repository, and publishing the extracted `home-event-schema` package.

**Steps**

1. Check your employer's IP and moonlighting rules before publishing anything.
2. Create the repository and push: [Create a repo](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).
3. Extract the schema package with `npm run schema:extract` and push it as its own repository with CI.
4. Invite reviewers if the repository stays private: [Managing access](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-access-to-your-personal-repositories).

**`.env`:** none. Ellie never calls GitHub.
**Verify:** clone the repository into a clean directory and run `npm ci && npm test`.
**Cost:** public repositories are free — <https://github.com/pricing>.
**Teardown:** none needed; archive rather than delete after judging.

---

## Appendix A: every configuration key

Server keys are declared once, in `packages/server/src/config/env.ts`, and validated with Zod at start-up. Application code reads `env.X`; nothing else reads `process.env` directly.

| Group | Keys | Needed for |
|---|---|---|
| Core | `NODE_ENV`, `PORT`, `HOST`, `LOG_LEVEL`, `ELLIE_PUBLIC_BASE_URL`, `CORS_ORIGINS`, `ELLIE_FAKE_NOW`, `DEFAULT_HOUSEHOLD_ID` | Always |
| Drivers | `STORAGE_DRIVER`, `LLM_DRIVER`, `NOTIFY_DRIVER`, `SCHEDULER_DRIVER`, `MOCK_STORAGE_MODE`, `DATA_DIR`, `REGION_PACKS_DIR` | Always; `auto` picks AWS when keys exist |
| Memory | `SEED_ON_START`, `SEED_ANCHOR_DATE`, `EVENT_DEDUPE_WINDOW_SEC`, `DYNAMODB_TEST` | Always |
| AWS common | `AWS_REGION`, `AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | §1 |
| Bedrock | `BEDROCK_MODEL_ID`, `BEDROCK_MAX_TOKENS`, `BEDROCK_TIMEOUT_MS`, `BEDROCK_GUARDRAIL_ID`, `BEDROCK_GUARDRAIL_VERSION`, `LLM_VOICE_TIMEOUT_MS`, `LLM_BACKGROUND_TIMEOUT_MS`, `DIAGNOSIS_SESSION_TTL_HOURS` | §2 |
| DynamoDB | `DYNAMODB_TABLE_NAME`, `DYNAMODB_ENDPOINT` | §3 |
| Scheduler | `EVENTBRIDGE_SCHEDULE_GROUP`, `EVENTBRIDGE_TARGET_ARN`, `EVENTBRIDGE_ROLE_ARN`, `SCHEDULER_QUEUE_URL`, `SCHEDULER_POLL_WAIT_SEC` | §4 |
| SNS | `SNS_TOPIC_ARN`, `SNS_SMS_ENABLED`, `SNS_SMS_SENDER_ID`, `SNS_SMS_ENTITY_ID`, `SNS_SMS_TEMPLATE_ID`, `SNS_SMS_TYPE` | §5 |
| Links | `LINK_SIGNING_SECRET`, `PHONE_LINK_TTL_HOURS`, `SHORT_LINK_BASE_URL`, `PHONE_PAGE_BASE_URL`, `PHONE_SEND_LIMIT_PER_HOUR` | §6 |
| Simulator | `SIMULATOR_ENABLED`, `SIM_ACCESS_CODE`, `SIM_ROUTER`, `SIM_ROUTER_TIMEOUT_MS`, `SIM_MAX_TOOL_CALLS` | Demo |
| Privacy | `OUTBOX_RETENTION_DAYS`, `CHAT_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `CONFIRM_TTL_SEC` | Always |
| OAuth | `OAUTH_ENABLED`, `OAUTH_ISSUER_URL`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URL`, `OAUTH_HOUSEHOLD_CLAIM`, `OAUTH_REQUIRED_SCOPES`, `DEV_OAUTH_PRIVATE_KEY`, `ALEXA_MODE` | §7, §8 |

Developer-script overrides are **not** read by the server and are listed commented out at the bottom of `.env.example`: `ELLIE_MCP_URL`, `ELLIE_BENCH_URL`, `ELLIE_DEMO_URL`, `ELLIE_SCREENSHOT_URL`, `ELLIE_PACKS_ROOT`, `ELLIE_OAUTH_TEST_TOKEN`, `DEV_OAUTH_ISSUER_PORT`, `ELLIE_DOCKER`.

## Appendix B: teardown checklist (after 20 Nov 2026)

1. `npm run aws:destroy` — removes the DynamoDB and messaging stacks.
2. Delete any schedules left in the `ellie` group, then the group.
3. Delete the SNS topic and subscriptions; release any sender id.
4. Delete the Bedrock guardrail.
5. Deactivate and delete the `ellie-dev` access key, then the user.
6. Stop `cloudflared`; delete the named tunnel and DNS record.
7. Delete the Alexa+ add-on from the developer console.
8. Delete the budget; confirm the next bill is zero.
9. Delete `.env` and any local `data/ellie-store.json`.
