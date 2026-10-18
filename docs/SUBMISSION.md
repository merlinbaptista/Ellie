# Submission Draft

> Edit this draft after checking the official submission rules. Do not submit placeholders or unverified service claims.
> Structure follows the headings used by the 2017 Grand Prize winner, [Smart Elephant](https://devpost.com/software/don-t-forget): Inspiration, What it does, How I built it, Challenges, Accomplishments, What I learned, What's next. Rationale: [WINNERS_ANALYSIS.md](WINNERS_ANALYSIS.md).

## Track and mini challenges

- **Primary track:** Alexa+ — a self-hosted MCP server (spec 2025-11-25, Streamable HTTP), **plus** the simulated Alexa+ web experience the rules explicitly permit. Both are in this repository.
- **AWS Builder mini challenge:** Bedrock (Converse, with guardrail support), DynamoDB, SNS, EventBridge Scheduler and SQS, each behind an adapter with a working mock. Integration details: [API_SETUP.md](API_SETUP.md).
- **Open Source mini challenge:** `home-event-schema`, MIT licensed, extracted from this repository during the hackathon window. 👤 *publish and add the URL*
- **Friction log:** [friction-log.md](friction-log.md) — eligible for the stated 10% bonus.

## Inspiration

<!-- 👤 Replace with your own household moment, in your own words. One true incident. No statistics, no invented survey numbers. -->

Then the gap: **Alexa+ can already set a reminder for a date you choose.** It cannot know that *your* cylinder lasts twenty-seven days rather than thirty, because that is what your last six refills show. It cannot apply your region's booking lead time. It cannot remember that the purifier did this before, and what fixed it.

## Project

**Name:** Headsup

**One-liner:** Normal reminders remember a time. Headsup remembers your home.

**Problem:** Household maintenance is fragmented across memory, receipts, generic reminders, repair searches, and separate provider workflows. A date-only reminder does not know which appliance, part, prior fix, or regional booking rule matters.

**Solution:** Headsup keeps a household-scoped event history, predicts maintenance from that history and region packs, diagnoses reported problems using cited evidence and safety gates, and hands detailed guidance or bookings to the phone.

**Who it helps:** Households managing recurring maintenance and supply refills, including the India and United States demo regions. Regional facts remain sourced starter data until a maintainer checks them.

**Surfaces:** five, from one server — the Echo Show card, the phone page, the Alexa+ simulator, the MCP App view, and the privacy views.

## MCP and AWS

Headsup serves MCP over Streamable HTTP at `/mcp` using protocol version 2025-11-25. Tools have read-only or destructive annotations, region-pack resources are available to clients, and the shared MCP App card is additive to complete text/structured results. Optional OAuth resource protection validates issuer, audience, expiry, scope, and token household ownership.

The AWS adapters support DynamoDB, Bedrock, SNS, and EventBridge Scheduler to SQS. Mock implementations keep the development path usable without AWS credentials. Live AWS deployment status: <!-- fill after the AWS go-live checklist -->.

## What Is Different

- Household history takes precedence over generic maintenance intervals.
- Region packs separate regional vocabulary, provider details, safety numbers, and sourced defaults from server logic.
- Diagnosis ranks deterministic candidates and cites evidence; safety checks run before DIY guidance.
- Follow-ups are limited and destructive privacy actions require explicit confirmation.
- Users can inspect, export, withdraw message consent, forget an item, or erase a household.

## Challenges

Full detail in [friction-log.md](friction-log.md). The three worth telling:

1. **Alexa+ and RFC 9728 disagree.** The QuickStart lists `WWW-Authenticate` in 401 responses as "Not Supported Yet"; RFC 9728 and the MCP authorization spec say to send it. Module 9 implemented the standard, so Headsup was non-conformant with the platform. Resolved with an `ALEXA_MODE` switch defaulting to the Alexa+ behaviour, with both paths tested.
2. **A one-in-forty test flake was a real product bug.** A UUID whose first segment happened to be eight digits matched the phone-number redaction heuristic, so `confirmationId` was rewritten to `[REDACTED_PHONE]` and a destructive confirmation could never complete. It was invisible under shuffled reruns; the MCP Inspector exposed it by printing the redacted id.
3. **Vitest 2 silently ignores `test.projects`.** The serial integration configuration never took effect, and `--project integration` matched nothing — with no warning at all.

## Accomplishments

- A real MCP server on spec 2025-11-25 over Streamable HTTP, verified with the official MCP Inspector: [inspector-evidence.md](audit/inspector-evidence.md).
- Two tools invoked from one spoken sentence, through a real MCP client loopback.
- Diagnosis where the model may only rank causes the server computed and must cite evidence IDs; invented causes, missing citations and uncited numbers are rejected in favour of the deterministic answer.
- A safety gate that runs before item creation, follow-up questions, DIY guidance and any model call.
- A full conformance table against the official Alexa+ requirements, including the deviation above: [DEPLOY.md](DEPLOY.md#alexa-connection-you).

## What I learned

- Redaction belongs on typed fields, not on every string. A probabilistic identifier bug is indistinguishable from a timing bug.
- Timeouts belong at the adapter boundary, not in each caller.
- Scripts that exercise a production guard (dedupe, rate limits) must own disposable data — never relax the guard to make a script pass.
- A release checklist must separate "the repository is wrong" from "the account is not provisioned", or real defects hide among missing keys.

## What's next

- Verify the remaining region-pack values against official sources, or remove them.
- Native-speaker review of the five starter UI languages.
- Live AWS deployment and a measured live latency benchmark (`npm run bench -- --live`).

## Open Source

Planned schema repository: https://github.com/merlinbaptista/home-event-schema

Status: locally extracted to `../home-event-schema`; repository creation and push are pending. <!-- replace URL/status after publication -->

## Quality

Latest workspace totals: schema 26, server 173, UI 6, phone 19, simulator 15 (239 total).

Mock benchmark: see [docs/bench.md](bench.md); all seven measured p95 values are below 500 ms, against the Alexa+ requirement of under 500 ms round trip. Headless `npm run demo:check`: all 15 steps passed against the mock server. Configuration status is reportable without revealing secrets via `npm run keys:check`.

## Limitations

- Region-pack starter defaults and emergency contacts require official-source review; see [docs/pack-verification.md](pack-verification.md).
- Hindi, Kannada, Tamil, and Spanish starter labels need native-speaker review.
- AWS Bedrock/SNS/Scheduler live behavior, public tunnel operation, and real-device Alexa+ connection require maintainer verification.
- SMS may require SNS sandbox verification; India delivery can require DLT registration.

## Links

- Headsup repository: <!-- add repository URL -->
- Schema repository: <!-- add after creation and push -->
- Demo video: <!-- add after recording -->
- Public HTTPS URL: <!-- add if a stable tunnel or deployment is available -->
- Official challenge page, rules, prizes and judging criteria: <https://amazonappdev2026.devpost.com/>
- Deadline (checked 18 Oct 2026): **24 Oct 2026, 12:30 am IST**
- Judging criteria (verbatim from that page): Tech Implementation, Design, Potential Impact, Quality of the Idea
- Reviewer access: if the repository stays private, share with `testing@devpost.com` and add the Amazon reviewer GitHub accounts listed in the rules. Invitations expire after 7 days — add them **at submission time**, not earlier.
