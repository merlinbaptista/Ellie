# Submission Draft

> Edit this draft after checking the official submission rules. Do not submit placeholders or unverified service claims.

## Project

**Name:** Ellie

**One-liner:** Normal reminders remember a time. Ellie remembers your home.

**Problem:** Household maintenance is fragmented across memory, receipts, generic reminders, repair searches, and separate provider workflows. A date-only reminder does not know which appliance, part, prior fix, or regional booking rule matters.

**Solution:** Ellie keeps a household-scoped event history, predicts maintenance from that history and region packs, diagnoses reported problems using cited evidence and safety gates, and hands detailed guidance or bookings to the phone.

**Who it helps:** Households managing recurring maintenance and supply refills, including the India and United States demo regions. Regional facts remain sourced starter data until a maintainer checks them.

## MCP and AWS

Ellie serves MCP over Streamable HTTP at `/mcp` using protocol version 2025-11-25. Tools have read-only or destructive annotations, region-pack resources are available to clients, and the shared MCP App card is additive to complete text/structured results. Optional OAuth resource protection validates issuer, audience, expiry, scope, and token household ownership.

The AWS adapters support DynamoDB, Bedrock, SNS, and EventBridge Scheduler to SQS. Mock implementations keep the development path usable without AWS credentials. Live AWS deployment status: <!-- fill after the AWS go-live checklist -->.

## What Is Different

- Household history takes precedence over generic maintenance intervals.
- Region packs separate regional vocabulary, provider details, safety numbers, and sourced defaults from server logic.
- Diagnosis ranks deterministic candidates and cites evidence; safety checks run before DIY guidance.
- Follow-ups are limited and destructive privacy actions require explicit confirmation.
- Users can inspect, export, withdraw message consent, forget an item, or erase a household.

## Open Source

Planned schema repository: https://github.com/merlinbaptista/home-event-schema

Status: locally extracted to `../home-event-schema`; repository creation and push are pending. <!-- replace URL/status after publication -->

## Quality

Latest workspace totals: schema 26, server 151, UI 6, phone 19, simulator 15 (217 total).

Mock benchmark: see [docs/bench.md](bench.md); all seven measured p95 values are below 500 ms. Headless `npm run demo:check`: all 15 steps passed against the mock server.

## Limitations

- Region-pack starter defaults and emergency contacts require official-source review; see [docs/pack-verification.md](pack-verification.md).
- Hindi, Kannada, Tamil, and Spanish starter labels need native-speaker review.
- AWS Bedrock/SNS/Scheduler live behavior, public tunnel operation, and real-device Alexa+ connection require maintainer verification.
- SMS may require SNS sandbox verification; India delivery can require DLT registration.

## Links

- Ellie repository: <!-- add repository URL -->
- Schema repository: <!-- add after creation and push -->
- Demo video: <!-- add after recording -->
- Public HTTPS URL: <!-- add if a stable tunnel or deployment is available -->
- Official challenge rules/categories/deadline: <!-- check official rules -->
