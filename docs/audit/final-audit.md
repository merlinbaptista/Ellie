# Final Module Audit: Gate A

Audit date: 2026-10-17. Implementation baseline: `a471bbd`. Module 11 prompt: `1299f8e`.
Scope: Phase A only. No application fixes, dependency upgrades, pack decisions, live deployment, or release tag are authorized here. Gate A is awaiting approval.

## Status and evidence rules

`DONE` = done on the stated local/mock scope; `PARTIAL` = incomplete or not fully proven; `MISSING` = absent; `KEY` = only live credentials/access block the check; `USER` = a human decision or action is required. These correspond to the five statuses requested in the Module 11 prompt.

Modules 1-6 are compact execution briefs, not the original full checkbox specifications. Their available requirements are enumerated below without inventing missing checkboxes. Module 9's prompt is absent: its implementation evidence cannot certify an unavailable original DOD. Modules 7, 8 and 10 have 32 explicit DOD checkboxes; every one is transcribed below, regardless of its existing tick. A tick is historical, not proof that an external check ran today.

## Module summary

| Module | Promised in available prompt | Evidence | Status | Fix needed |
|---|---|---|---|---|
| 1 | Foundation, mock adapters, MCP transport, health/dev routes, smoke, tests and setup | `packages/server/src/app.ts`; `packages/server/test/mcp.integration.test.ts`; build/typecheck/lint pass; 16-tool SDK sweep | PARTIAL | Repeatable smoke fails at phone handoff; original full DOD unavailable |
| 2 | Browser-safe Zod schema, region registry/resources, JSON Schema, pack validator, 90% line coverage | `packages/schema/src/`; `packages/schema/json-schema/region-pack.schema.json`; 26 tests pass; pack validation passes | PARTIAL | Current coverage percentage not rerun; 59 resolved starter values remain unverified; original full DOD unavailable |
| 3 | Repositories, household/event/history services, consent, aliases, ask-once follow-ups, anchored seed | `packages/server/test/{repos,items,events,history,followups,seed,storage.contract}.test.ts`; setup/event/history succeed in MCP sweep | DONE | Mock/file scope proven; DynamoDB Local and AWS not run; original full DOD unavailable |
| 4 | Pure history-first prediction, regional rules, component history, live status, reminders, time travel | `packages/server/test/prediction.*.test.ts`; `reminders.test.ts`; prediction/due/dev-clock calls succeed | PARTIAL | Dev-clock spoken date/count becomes `[REDACTED_PHONE]`; original full DOD unavailable |
| 5 | Safety-first diagnosis, deterministic evidence/scoring/plans, bounded cited Bedrock ranking, resolution lifecycle | `packages/server/test/diagnosis.*.test.ts`; `bedrock.adapter.test.ts`; `resolutions.test.ts`; safety and resolution MCP calls succeed | DONE | Local/mock scope proven; real Bedrock not run; original full DOD unavailable |
| 6 | Signed links, token-scoped/idempotent APIs, consent/dedupe, providers, SNS, Scheduler/SQS, infra | `packages/server/test/journey3.phone.integration.test.ts`; link/phone/SNS/EventBridge/SQS tests; `infra/ellie-messaging.yaml` | PARTIAL | Smoke fixture repeatability; actual SNS/Scheduler delivery not run; original full DOD unavailable |
| 7 | Shared UI, phone flows/chat/translation, MCP Apps, security headers and tests | 11 DOD rows below; phone 19 and UI 6 tests pass; built phone JS 54.97 KB gzip | PARTIAL | Current smoke fails; native translation review and live Bedrock not done; no external MCP Apps host |
| 8 | Real MCP-loopback orchestration, voice/text simulator, phone/host views, dev controls, production gate | 10 DOD rows below; simulator 15 tests pass; clone `/sim/` renders and presenter step 1 passes | PARTIAL | Unticked manual voice/Bedrock rehearsal row; live Bedrock not run |
| 9 | Privacy/trust scope inferred from roadmap and implementation, not original prompt | `privacy.*.test.ts`; `oauth.test.ts`; `journey6.privacy.integration.test.ts`; prior live OAuth check in friction log | PARTIAL | Original prompt missing; full-suite privacy journey failed once but isolated rerun passed |
| 10 | Demo/release tooling, pack decisions, Docker, deployment, schema extraction, submission | 11 DOD rows below; demo 15/15; mock bench 7/7; standalone schema 22 tests pass | PARTIAL | External/user release gates, dependency advisories, full-suite failure and smoke failure remain |

Module summary counts (10 rows): DONE 2; PARTIAL 8; MISSING 0; KEY 0; USER 0. Mixed modules use PARTIAL; credential-only and human-only subitems are classified separately below. This is not a claim that all original module requirements are available or complete.

## Available requirements: Modules 1-6

| Module | Available scope/requirement | Concrete evidence and limitation |
|---|---|---|
| 1 | Node/TypeScript ESM NodeNext workspaces; SDK v1; Express/Zod/Pino/Vitest; no-key mocks; timed tools | Root/package manifests, `tsconfig.base.json`, `packages/server/src/mcp/`; clean install/build/typecheck/lint pass; MCP sweep succeeds |
| 1 | Config/drivers, system/fake clock, adapter interfaces/mocks, context/errors, ping/status, sessions, health/status/outbox/dev-clock, smoke, docs/VS Code | `drivers.test.ts`, `adapters.test.ts`, `result.test.ts`, `mcp.integration.test.ts`; smoke reaches phone step then fails |
| 2 | Strict entities/contracts; DEFAULT/IN/US/UK sources; pure match/date/unit/format/id helpers; browser-safe schema with Zod runtime only | `packages/schema/src/`, schema manifest and 26 passing tests; current coverage threshold not measured |
| 2 | Generated RegionPack JSON Schema, validator, extra-pack registry, region tool and resources, docs | Generated schema, `packages/schema/scripts/validate-packs.ts`, `regions.test.ts`; smoke reads IN resource before phone failure; 59 inherited aggregate defaults |
| 3 | DynamoDB/Local and file storage, central keys, repositories, TTL, consent-only contact/masking/address rejection | `storage.contract.test.ts`, `repos.test.ts`, `tools.memory.integration.test.ts`; cloud/Local execution not run |
| 3 | Useful ask-once/default/retry follow-ups, catalog/custom resolution and learned aliases, retry dedupe, anchored two-household seed, dev APIs | `followups.test.ts`, `items.test.ts`, `events.test.ts`, `seed.test.ts`; fresh clone seed succeeds |
| 4 | Pure history-first prediction, explicit pack rules, confidence/explanation, component history, live status, snapshots | `prediction.engine.test.ts`, `prediction.rules.test.ts`, `prediction.confidence.test.ts`, `components.test.ts`; mock predictions succeed |
| 4 | Deterministic upsert/cancel/staleness-checked reminders, due tools/time travel, optional DynamoDB Local | `reminders.test.ts`, `dueThisWeek.test.ts`, `journey1.prediction.integration.test.ts`; date-redaction issue in live local tool sweep |
| 5 | Shared diagnosis types; TTL/session/resolution keys through repositories; safety before item/question/LLM; no DIY on stop | `packages/schema/src/diagnosis.ts`, `diagnosis.safety.test.ts`, `diagnosis.flow.test.ts` |
| 5 | Deterministic evidence/pack candidates/tie order/useful bounded questions and pack fix plans | `diagnosis.evidence.test.ts`, `diagnosis.candidates.test.ts`, `diagnosis.questions.test.ts` |
| 5 | Bedrock Converse credentials/timeouts/retries; generic redacted inputs; citation/cause/number validation; voice fallback/refinement | `bedrock.adapter.test.ts`, `diagnosis.llm.test.ts`; real Bedrock not run |
| 5 | Confirmed resolution/component events/dedupe/recompute/session close; prior seeded resolution; MCP journey | `resolutions.test.ts`, `journey2.integration.test.ts`, `seed.test.ts`; resolution tool sweep succeeds |
| 6 | Shared payload/action schemas; HMAC/wall expiry; short codes; redirect/fallback security; scoped/rate-limited/idempotent phone APIs | `links.sign.test.ts`, `links.short.test.ts`, `phone.api.test.ts`, `journey3.phone.integration.test.ts` |
| 6 | Stored consent, requested channel, one-link GSM-7/160-char send, 120-second dedupe/hour limit, provider ask-once/default/custom | `sendToPhone.test.ts`, `phone.messages.test.ts`, `providers.test.ts`; fixed smoke household collides with dedupe |
| 6 | SNS mirror/masking; authoritative schedule mirror; stable one-off schedules; SQS retries/FIRED markers; credential gating/shutdown | `sns.adapter.test.ts`, `eventbridge.adapter.test.ts`, `sqsPoller.test.ts`, `awsCredentials.test.ts`; real AWS not run |
| 6 | Linked reminders/queued no-consent path; status/dev test schedule; CloudFormation/IAM; SMS sandbox/DLT guidance | `reminders.test.ts`, `infra/ellie-messaging.yaml`, `infra/iam-policy-messaging.json`, `docs/DEPLOY.md`; no real delivery proof |

## Exact DOD checklist: Modules 7, 8 and 10

The promise column preserves each source checkbox's wording. Status applies to the whole row, not merely the implemented portion. Source ticks are shown separately.

| ID | Source tick | Promised DOD checkbox | Evidence | Status | Fix needed |
|---|---|---|---|---|---|
| 7.01 | x | §0 follow-ups committed separately: explicit `ttlClock`, schema 1.4.1, phone smoke, AC test names listed, `aws:check` | `2df8b37`; `docs/modules.md` traceability | DONE | None for historical follow-ups; smoke regression tracked separately |
| 7.02 | x | `@ellie/schema` 1.5.0 chat and translation schemas | `packages/schema/CHANGELOG.md`; `packages/schema/src/phone.ts` | DONE | None; current schema is 1.7.0 |
| 7.03 | x | `@ellie/ui` Card + PhoneView renderer, accessible, light/dark, 5 UI languages (starter translations flagged for review) | `packages/ui/src/`; UI 6 tests; `packages/phone/test/a11y.test.tsx` | DONE | Starter status is explicit; native review remains human-owned |
| 7.04 | x | Phone page: fix / booking / summary / error pages; token stripped from the URL; ticked steps persist; Fixed it / Didn't work / I booked it work; JS ≤ 120 KB gzipped | `FixPage.test.tsx`, `StepList.test.tsx`, `BookingSummary.test.tsx`, `token.test.ts`; build JS 54.97 KB gzip | DONE | None on automated/local scope |
| 7.05 | x | Safety views show only the banner and call button | `packages/phone/test/FixPage.test.tsx`; `packages/ui/test/` | DONE | None on tested scope |
| 7.06 | x | Phone chat: safety first, scoped, deterministic intents, validated LLM answers, 20-message cap, no PII | `packages/server/test/phone.chat.test.ts` | DONE | Real Bedrock not exercised |
| 7.07 | x | Translation: mock labelled honestly; Bedrock path protects placeholders; safety text never translated; cached | `packages/server/test/phone.translate.test.ts` | DONE | Real Bedrock and native review not exercised |
| 7.08 | x | MCP Apps view on 5 tools with working card actions; text output unchanged; skipped cleanly if the build is missing | `mcp.apps.test.ts`; `packages/simulator/test/McpAppHost.test.tsx`; prior host rehearsal in friction log | DONE | External host not run; direct SDK-v1 bridge limitation documented |
| 7.09 | x | Server serves `/phone/` with security headers; short links go there directly | `static.test.ts`, `links.short.test.ts` | DONE | None on automated scope |
| 7.10 | x | §10 results covered by component, API, and integration tests; all tests green; smoke covers the phone path | Phone/UI tests pass; server 150/151; `scripts/smoke.ts:48` fails | PARTIAL | Investigate integration failure and isolate smoke fixture |
| 7.11 | x | Docs, Copilot rules and friction log updated; commit: `git commit -m "Module 7: phone page, phone chat and MCP Apps view"` | `7abecef`; project instructions and friction log | DONE | None |
| 8.01 | x | §0 follow-ups committed separately (commit history table, no-amend rule, Module 7 §0 traceability, axe tests, Host view verification) | `334f0ce`; `docs/modules.md`; friction log Host view entry | DONE | None |
| 8.02 | x | `@ellie/schema` 1.6.0 simulator protocol (marked as not part of the OSS schema) | `packages/schema/src/sim.ts`; `schema.extract.test.ts` | DONE | None |
| 8.03 | x | Orchestrator uses a real MCP client loopback; safety pre-check; multi-intent split; one question per reply with a queue; context args | `sim.api.test.ts`, `sim.combine.test.ts`, `sim.followup.test.ts`, `sim.split.test.ts` | DONE | None on local scope |
| 8.04 | x | Deterministic router passes the 30+ utterance table; Bedrock tool-use router with validation, redaction and fallback | `sim.router.deterministic.test.ts`, `sim.router.bedrock.test.ts` | DONE | Live Bedrock remains separately blocked |
| 8.05 | x | Simulator UI: Echo Show frame, light bar, card stack, captions, push-to-talk voice with a text fallback, mute, barge-in | `packages/simulator/src/`; `packages/simulator/test/voice.test.ts`; clone browser render | DONE | Real microphone rehearsal not run |
| 8.06 | x | Phone panel shows the outbox and opens the phone page in a same-origin frame | `packages/simulator/src/`; `static.test.ts`; prior browser evidence in friction log | DONE | Real-phone/tunnel check not run |
| 8.07 | x | Household switcher, time controls, reseed, timeline, dev drawer, Host view | `packages/simulator/src/`; `McpAppHost.test.tsx`; clone controls visible | DONE | Not every control manually rerun today |
| 8.08 | x | Served at `/sim/` (one process); gated in production with an access code | `sim.api.test.ts`, `static.test.ts`; clone browser on port 8789 | DONE | Production deployment not run |
| 8.09 | blank | §8 rows match; live voice rehearsal and Bedrock routing completed manually; no axe violations; bundle ≤ 200 KB; all tests green | Simulator 15 tests pass; build JS 60.05 KB gzip; server full gate not green | PARTIAL | Manual microphone and live model rehearsal; reproduce full-suite failure |
| 8.10 | x | Docs, Copilot rules and friction log updated; commit: `git commit -m "Module 8: simulated Alexa+ web app"` | `9035db5`; `cfdddfb`; module prompt and friction log | DONE | None |
| 10.01 | blank | §0 follow-ups committed separately (OAuth live check recorded, screenshot note, totals column) | `c417b79`; `docs/modules.md`; friction log OAuth live check | DONE | None |
| 10.02 | blank | Presenter mode with chip fallback; `demo/script.json`; `demo:check` passes locally | `demo/script.json`; demo 15/15; clone presenter step 1 passes | DONE | Full manual video rehearsal still pending |
| 10.03 | blank | Pack verification report produced; demo-used values and emergency numbers verified or removed [YOU]; new unverified count recorded | `docs/pack-verification.md`; validator 59 aggregate defaults | USER | Review official sources and choose verify/keep-default/remove; demo/emergency values must verify or remove |
| 10.04 | blank | `preflight` and `bench` scripts; `docs/bench.md` with p95 < 500 ms per tool (mock and AWS) | Scripts exist; mock 7/7 pass; production preflight fails expected dev configuration | PARTIAL | Configure production and measure AWS latency; no live latency claim |
| 10.05 | blank | Dockerfile + compose; image runs and passes `/health` | `Dockerfile`; `docker-compose.yml`; Docker CLI unavailable | PARTIAL | Build/run with Docker or explicitly accept untested status |
| 10.06 | blank | `docs/DEPLOY.md` with tunnel, AWS go-live, Alexa+ placeholder section; `aws:deploy`, `aws:policy`, `aws:destroy` scripts | `docs/DEPLOY.md`; root script definitions; `aws.deploy.test.ts` | DONE | Module 11 official conformance review belongs to Phase B |
| 10.07 | blank | AWS services checked live with `aws:check` [YOU]; any fallback to mock documented | Four mock drivers reported by status/preflight; no AWS credentials | KEY | Credentials and service provisioning; run actual service checks |
| 10.08 | blank | `home-event-schema` extracted with CI, contributing docs and passing tests; pushed [YOU] | Standalone sibling tree: typecheck, 22 tests, pack validation/schema stability pass | USER | Publish public repository and verify its CI; triage toolchain advisories |
| 10.09 | blank | Final README, `docs/SUBMISSION.md`, `docs/VIDEO_SCRIPT.md`, friction log summary | Files exist; submission placeholders and external claims still pending | PARTIAL | Finish placeholders and align claims with live evidence after later gates |
| 10.10 | blank | Three rehearsals done; video recorded [YOU] | Script exists; no completed rehearsal/video evidence | USER | Perform three rehearsals and record/upload sub-3-minute video |
| 10.11 | blank | All tests green; `v1.0.0` tagged; commit: `git commit -m "Module 10: demo, release and submission"` | `c8ebd77` exists; 216/217 pass in Phase A full run; no tag | PARTIAL | Resolve gate failures; tag only after explicit final user confirmation |

## A2: Full gate results

The starting worktree was clean at `a471bbd`. The benchmark subsequently modified tracked `docs/bench.md`; it is retained as generated evidence. Commands ran on Windows, Node 24.21.0, mock/file adapters. Server clock for demo checks was 2026-10-16T03:30:00.000Z (09:00 IST).

| Command/check | Result | Recorded evidence |
|---|---|---|
| `git status --short` before gate | PASS | Empty at baseline |
| `npm ci` | PASS, advisories remain | 10 repository advisories: 3 moderate, 4 high, 3 critical; no forced upgrade |
| `npm run build` | PASS | Schema, shared UI, phone, MCP App, simulator, server built |
| `npm run typecheck` | PASS | All workspace checks complete |
| `npm run lint` | PASS | ESLint exits successfully |
| `npm test` | FAIL | Schema 26/26; server 150/151; UI 6/6; phone 19/19; simulator 15/15; total 216 passed, 1 failed, 217 discovered |
| Isolated privacy journey rerun | PASS | `test/journey6.privacy.integration.test.ts` passes alone; does not erase full-run failure |
| `npm run validate:packs` | PASS with starter warning | 59 resolved unverified values: DEFAULT 4, IN 31, US 16, UK 8 |
| `npm run demo:check` | PASS | All 15 scripted steps |
| `npm run bench` | PASS | Seven tools, 30 samples each after 3 warmups; table below and `docs/bench.md` |
| `npm run smoke` | FAIL | `scripts/smoke.ts:48`: send_to_phone did not return a short URL |
| Production `npm run preflight` | NOT READY | 4 failures: NODE_ENV, signing secret, HTTPS base URL, simulator gate; 5 warnings: localhost CORS plus four mock drivers |

The total remains 217; no test-count drift occurred. The privacy journey failed while reading `data.scope` at line 45 because `data` was undefined. The isolated pass suggests an order/concurrency/time-sensitive failure, but its root cause is unproven. Proposed investigation: retain the unexpected MCP response in test diagnostics, repeat in full-suite conditions, and inspect the confirmation path before changing behavior.

Smoke uses fixed household `demo-smoke-phone`; its send is suppressed by the 120-second duplicate-send guard on a repeat run. The script assumes every successful send response contains a new short URL. A disposable unique-household diagnostic succeeded. Proposed fix: independent synthetic fixture and cleanup, without weakening production dedupe.

| Tool | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|
| due_this_week | 8 | 9 | 12 |
| predict_next | 7 | 9 | 9 |
| get_history | 8 | 9 | 10 |
| log_event | 5 | 6 | 8 |
| diagnose | 76 | 101 | 106 |
| send_to_phone | 4 | 5 | 5 |
| what_do_you_know | 6 | 8 | 8 |

Benchmark recorded at 2026-10-17T12:10:03.222Z. These are local mock/file timings, not AWS or Alexa+ network timings.

## A3: Fresh clone

Local clone outside the workspace: `%TEMP%/ellie-module11-fresh-clone`, based on `a471bbd`; no Git remote is configured. README install, build and `seed:reset` succeeded. The default date anchor was October 17, so the initial seed did not match the October 16 scripted demo. Starting with the explicit fake-clock setting and entering presenter mode reset the demo to October 16; its first step passed.

`npm run dev` rebuilt and served `http://127.0.0.1:8789/sim/`. The integrated browser rendered the household selector, Echo Show, text input/chips, phone panel and presenter. Clicking Present opened step 1/11 and produced a passing-step indicator. This is not an end-to-end eleven-step browser rehearsal or microphone test. The temporary server was stopped after the check.

Proposed README clarification after approval: distinguish everyday local-date seeding from the explicit reproducible demo anchor/clock. No README fixes have been made in Phase A, respecting Gate A's fix-approval instruction.

## A4: Specific checks

| Check | Status | Evidence and limitation |
|---|---|---|
| Spec 2025-11-25, POST /mcp Streamable HTTP, JSON schemas/descriptions/annotations/structured output | DONE | `mcp.integration.test.ts`, `mcp.apps.test.ts`, `result.test.ts`; real SDK initialization/list/calls succeeded |
| Inspector connects/lists/calls every tool | PARTIAL | Inspector UI not run. Real SDK client listed 16 tools and made 18 successful calls, none missing; not mislabeled as Inspector evidence |
| Code safety gate, gas/electrical/water-near-power tests | DONE | `diagnosis.safety.test.ts`: gas 1906, electrical 112, water near power 112, fire 101, CO 112; LLM bypass checked. Numbers are pack facts, still subject to user source verification |
| Privacy audit, log/model redaction | DONE | `privacy.audit.test.ts` passed in full run; `privacy.redact.test.ts`, `diagnosis.llm.test.ts`, `sim.router.bedrock.test.ts` cover scoped/redacted requests. Separate privacy journey failure remains open |
| C7 explanation in modules.md | DONE | 26 minus phone-only 3 minus mixed contracts 2 plus generic contracts 1 equals 22; recorded with the separate Phase A history update in `docs/modules.md` |
| C6 standalone advisory triage | DONE | Exact package/severity/dev-only recommendations recorded below; no upgrade applied |

SDK sweep tools (all called): `ellie_ping`, `ellie_status`, `ellie_region_info`, `setup_household`, `log_event`, `get_history`, `predict_next`, `due_this_week`, `ellie_dev_time_travel`, `diagnose`, `log_resolution`, `send_to_phone`, `what_do_you_know`, `manage_consent`, `forget_item`, `forget_household`. Forget tools each ran plan and confirmation, yielding 18 calls total. The disposable synthetic household was erased and the fake clock restored. One safety call used seeded demo context. No actual personal contact or link token is included in this audit.

The dev-clock response was `It's now [REDACTED_PHONE] reminders were sent.` A broad redactor appears to consume date/count text; that is a hypothesis, not a completed root-cause finding. Proposed regression: preserve date/count speech while continuing to mask real phone strings.

Prior OAuth loopback evidence remains in `docs/friction-log.md` and `c417b79`: missing-token 401 with resource metadata challenge, RFC 9728 metadata, valid token, and cross-household rejection. This is not proof of an Alexa+ production connection or authorization-code/PKCE conformance; official-doc review belongs to Phase B.

## C6: Standalone schema dependency triage

`npm audit --json` rerun in the extracted sibling package reports seven vulnerable packages: three critical, one high, three moderate. All seven belong to the dev/test toolchain; the production dependency is Zod. Dev-only is not harmless: do not expose test/UI/dev servers or run untrusted test input. Audit severity includes inherited findings, so this is not seven independent root vulnerabilities.

| Package | Severity | Scope | Advisory or inherited cause | Recommendation |
|---|---|---|---|---|
| @vitest/coverage-v8 | critical | dev, direct | Inherits vitest | Upgrade with the matching tested Vitest version |
| @vitest/mocker | moderate | dev, transitive | GHSA-82fw-gwwq-j7x9; inherits Vite | Upgrade aligned Vitest toolchain; do not expose mock/dev server |
| esbuild | moderate | dev, transitive | GHSA-67mh-4wv8-2f99 | Upgrade via compatible Vite/Vitest dependency set |
| tinypool | critical | dev, transitive | GHSA-5gmw-xhrv-c9v3; GHSA-85c8-ppgw-ccpr | Upgrade through tested Vitest; do not accept untrusted worker options |
| vite | high | dev, transitive | GHSA-4w7w-66w2-5vf9; GHSA-v6wh-96g9-6wx3; GHSA-fx2h-pf6j-xcff; inherits esbuild | Review patched compatible version and Windows dev-server exposure |
| vite-node | moderate | dev, transitive | Inherits Vite | Upgrade aligned Vitest/Vite toolchain |
| vitest | critical | dev, direct | GHSA-5xrq-8626-4rwp; GHSA-82fw-gwwq-j7x9; inherits mocker/tinypool/Vite/vite-node | Review proposed major upgrade to 5.0.5 with Node compatibility, 22 tests, coverage, typecheck and pack/schema stability checks |

Advisory details: `https://github.com/advisories/<GHSA-ID>`. Audit proposes a semver-major Vitest/coverage upgrade; approval and compatibility testing are required. No `npm audit fix --force` was run. The monorepo's separate 10-advisory result also needs focused triage before release; no inference is made that all monorepo findings are dev-only.

## Gate A issue register

Counts in this register are independent of module/checklist counts: MISSING 1; PARTIAL 10; KEY 2; USER 5; DONE 0 (18 open rows). Phase B deliverables not yet implemented are future work, not retrospective Module 1-10 failures.

| ID | Status | Finding/blocker | Proposed action after approval |
|---|---|---|---|
| A-01 | PARTIAL | Full run 216/217; isolated privacy journey passes | Reproduce and capture unexpected confirmation response; fix proven local cause, rerun narrow and full gates |
| A-02 | PARTIAL | Smoke assumes fresh URL despite fixed-household send dedupe | Use isolated synthetic fixture/cleanup; preserve production dedupe; test repeated runs |
| A-03 | PARTIAL | Dev-clock date/count over-redacted | Add focused redaction regression; preserve phone masking |
| A-04 | PARTIAL | Fresh clone default seed date differs from scripted date | Clarify explicit demo anchor/clock and presenter reset in README |
| A-05 | PARTIAL | Standalone 7 and monorepo 10 dependency advisories | Controlled toolchain triage/upgrade, no forced fixes; repeat tests and audits |
| A-06 | MISSING | Module 9 source prompt absent | Restore original supplied prompt; do not fabricate requirements |
| A-07 | PARTIAL | Modules 1-6 condensed; original DOD/coverage proof incomplete | Recover original prompts if available; rerun schema coverage before claiming threshold |
| A-08 | PARTIAL | Inspector UI not exercised | Run actual Inspector, save sanitized list/call evidence; SDK sweep is supporting evidence only |
| A-09 | PARTIAL | Docker build/runtime and compose config not run | Install Docker or accept/document untested status |
| A-10 | PARTIAL | Scripted screenshots absent; managed Chromium unavailable | User installs Chromium, then generate and inspect captures |
| A-11 | PARTIAL | Production preflight has 4 failures/5 warnings | Complete production prerequisites in B/C; keep no-key mock path valid |
| A-12 | KEY | AWS/Bedrock/DynamoDB/SNS/Scheduler and AWS benchmark not run | Provision credentials/services after B; run C/D live checks |
| A-13 | KEY | Public HTTPS/real-phone and actual Alexa+ access not proven | Establish reachable endpoint/access; official B4 review before onboarding |
| A-14 | USER | 59 aggregate starter facts; 56 unique raw source entries | Decide report rows using official sources; demo/emergency facts verify or remove |
| A-15 | USER | Native language review not completed | Native review or explicit English-only demo decision |
| A-16 | USER | Real microphone, three rehearsals, video missing | Rehearse with fallback; record under three minutes after live evidence |
| A-17 | USER | Public repos/reviewer access and submission placeholders pending | IP/employment check, publish/invite at submission, complete URLs/text |
| A-18 | USER | Final release/tag not authorized | User confirms final checklist after green gates; no tag now |

## Security and stop condition

Reachable-history scan for credential-shaped AWS keys/private keys found no matches. A comprehensive historical PII/token scan has not been completed; literal security terms in docs/tests are not credentials. Before each audit docs commit, inspect staged content and scan credential-shaped values; never print or commit actual secrets. No pre-commit hook is installed by this read-only audit; automation can be considered after approval.

Gate A is not green. Approve the proposed fixes explicitly before application/README/dependency changes. Do not start Phase B, add live keys, deploy, implement candidate features, or tag as part of this audit.