# Module 6: Phone Handoff and Scheduling

## Goal

Deliver fixes, bookings, and summaries to a consented phone/email destination using short signed links. Keep the local outbox/timer as a complete mock path; use SNS and EventBridge Scheduler to SQS when AWS settings are available.

## Signed link and phone API

- Phone payload/view/action schemas are browser-safe in `@ellie/schema` 1.4.0.
- Sign payload JSON with HMAC-SHA256, compare signatures timing-safely, and use real wall-clock expiry. Refuse the production default or a secret shorter than 32 characters.
- Store collision-checked 8-character short codes in the `LINK` partition. Short-link records contain the token, household, kind, created time, and TTL. Provide household deletion support.
- `GET /l/:code` redirects to the reachable configured Module 7 page or the server-rendered fallback. The fallback escapes all data, disables caching/referrers, and has a restrictive CSP.
- Phone API reads/actions require a valid token and are scoped to its household. Enforce IP and token rate limits, idempotent action records, no PII responses, and safe expired/invalid responses.

## Handoff and providers

- `send_to_phone` requires stored consent, chooses only the requested or available channel, supports fix/booking/summary, builds one link, deduplicates for 120 seconds, limits sends hourly, logs a system note, and never returns the token.
- SMS messages are GSM-7 and at most 160 characters; email is plain text. Mask phone/email in speech, UI, logs, and outbox console output.
- Ask once when a new item's booking provider is ambiguous. Use catalog defaults for "not sure", accept pack-owned provider names/aliases, and store spoken phone numbers as custom phone-call providers.

## AWS adapters

- SNS uses SMS attributes only when configured; otherwise publish to the topic. Always mirror send outcomes in `OUTBOX`. Mask destinations in logs.
- EventBridge schedules one-off timezone-correct `at()` jobs into SQS. The shared `SCHEDULE` mirror is authoritative for local and AWS modes. Use sanitized stable AWS names, update on conflicts, and delete on cancellation.
- The abortable SQS poller long-polls, handles unknown jobs, leaves handler failures for redrive, and deletes successful messages. A seven-day FIRED marker protects against duplicate queue delivery and time-travel overlap. Time-travel ticks mirror jobs in AWS mode too.
- Start AWS services only when their settings and cached credential-chain probe are available. Shutdown must stop polling and close clients.

## Reminders and operations

- Reminder and delivery-check messages contain signed short links. Without stored contact consent, write a queued outbox record instead of contacting SNS.
- `ellie_status` reports notifier, scheduler, queue depth, and active short links. Development has a two-minute test-schedule endpoint.
- CloudFormation creates the topic, optional email subscription, SQS queue/DLQ, schedule group, queue policy, and scheduler role. Replace the messaging IAM policy ARN placeholders before attaching it.
- Verify sandbox destinations before SMS testing; Indian SMS generally requires DLT entity and template IDs. Topic-to-email is the easiest demo route.

## Verification

Run lint, typecheck, build, all unit/integration tests, region-pack validation, and MCP smoke. Include unit coverage for links, GSM-7, providers, consent/dedupe, SNS, EventBridge, SQS retry/markers, and an MCP+HTTP Journey 3.
