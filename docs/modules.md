# Module roadmap

| #   | Module                           | Delivers                                                                                                                   | Status |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Foundation & MCP skeleton        | Monorepo, config, driver switch, adapter interfaces + mocks, MCP Streamable HTTP server, ping/status, tests, VS Code setup | ✅     |
| 2   | Home-event schema & region packs | `@ellie/schema`: Zod types and IN/US/UK/default packs                                                                      | ✅     |
| 3   | Household memory                 | Repositories, DynamoDB adapter, household/event tools, Bengaluru + Texas seed data                                         | ✅     |
| 4   | Prediction engine                | Due dates, time-zone maths, regional minimums, confidence, reminders                                                       | ✅     |
| 5   | Diagnosis engine                 | Symptom flows, safety rules, Bedrock adapter, diagnosis/resolution tools                                                   | ✅     |
| 6   | Phone handoff & scheduling       | SNS, EventBridge Scheduler, booking links, signed phone links                                                              | ✅     |
| 7   | Phone fix page                   | Mobile page, steps, chat, booking, MCP Apps view                                                                           | ✅     |
| 8   | Simulated Alexa+ web app         | Browser voice, multi-intent, Echo Show cards, household switcher                                                           | ✅     |
| 9   | Privacy & trust                  | Knowledge and forget tools, consent, export, retention, optional OAuth 2.1 resource protection                             | ✅     |
| 10  | Demo & submission                | Presenter, demo check, preflight/bench, pack report, Docker/deployment prep, schema extraction, submission docs            | ⏳     |
| 11  | Go-live, final audit and win plan | Phase A audit recorded; Gate A awaiting approval; no fixes or Phase B started                                               | ⏳     |
| 12  | Gate A closure, API-ready freeze  | Gate A fixes applied; API inventory, `API_SETUP.md`, `keys:check`, Alexa+ conformance, winner benchmarking                  | ✅     |

Module 10 verification: Verify or remove unverified pack values (59 after Module 5).

## Commit history

| Commit    | Contents                                                          | Tests (schema / server / ui / phone / simulator) | Total |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------ | ----: |
| `9291b85` | Module 5 diagnosis engine                                         | —                                                |     — |
| `2993d55` | Module 5 follow-ups                                               | —                                                |     — |
| `afdcac6` | Module 6 phone handoff and scheduling                             | —                                                |     — |
| `2df8b37` | Module 6 follow-ups                                               | —                                                |     — |
| `7abecef` | Module 7 phone page, chat and MCP Apps                            | —                                                |     — |
| `334f0ce` | Module 7 follow-ups: CSP, axe checks, traceability, no-amend rule | —                                                |     — |
| `9035db5` | Module 8 simulated Alexa+ web app                                 | 24 / 124 / 6 / 17 / 11                           |   182 |
| `cfdddfb` | Module 8 completion status and history docs                       | —                                                |     — |
| `086e048` | Module 9: privacy and trust                                       | 26 / 142 / 6 / 19 / 11                           |   204 |
| `c8ebd77` | Module 10 local tooling (external go-live steps pending)          | 26 / 151 / 6 / 19 / 15                           |   217 |
| `1299f8e` | Module 11 source prompt, committed separately                    | Not rerun (prompt only)                          |     — |
| `bbe6754` | Module 11 Phase A audit; Gate A awaiting approval                | 26 / 150 passed, 1 failed / 6 / 19 / 15           | 216 passed / 217 |
| `2d653ee` | Module 11 Gate A roadmap record                                  | Not rerun (docs only)                            |     — |
| `e6aaccc` | Module 12 source prompt, committed separately                    | Not rerun (prompt only)                          |     — |
| `defeb9f` | Fix 1.1a: real serial Vitest workspace for integration tests     | —                                                |     — |
| `e0752c3` | Fix 1.3a: redactor no longer swallows spoken dates and counts    | —                                                |     — |
| `e2f5021` | Fix 1.2: repeatable smoke with a disposable household            | —                                                |     — |
| `48b276e` | Fix 1.1b: redactor no longer corrupts confirmation ids           | —                                                |     — |
| `8736ba0` | Fix 1.8: MCP Inspector CLI evidence for every tool               | —                                                |     — |
| `22af714` | Fix 1.10: screenshot script captures all four demo captures      | —                                                |     — |
| `a419786` | Fix 1.6: all ten dependency advisories triaged                   | —                                                |     — |
| `51f9fbc` | Fix 1.11: preflight splits CODE problems from CREDENTIAL gaps    | —                                                |     — |
| `93485f5` | Fixes 1.5/1.9: demo anchor pinned, Docker status stated          | —                                                |     — |
| `20979a8` | Fix 1.4: reconstructed Module 9 prompt                           | —                                                |     — |
| `6775af9` | Gate A register closed; Phase 1 evidence recorded                | 26 / 157 / 6 / 19 / 15                           |   223 |
| `fef7b10` | Phase 2 B1/B3: `keys:check` and per-service `aws:check`          | —                                                |     — |
| `711431d` | Phase 2 B5: configurable Bedrock timeout and `bench -- --live`   | —                                                |     — |
| `52e1936` | Phase 2 B4: `ALEXA_MODE` 401 behaviour and conformance table     | —                                                |     — |
| `75b3c04` | Phase 2 B2: `docs/API_SETUP.md`                                  | —                                                |     — |
| `e878256` | Phase 3: `docs/WINNERS_ANALYSIS.md`                              | 26 / 173 / 6 / 19 / 15                           |   239 |
| `a071b5f` | Phase 3.3: README, submission and video script cheap wins        | —                                                |     — |
| `bc27ba5` | Card audit: glanceable due and diagnosis cards                   | 26 / 174 / 6 / 19 / 15                           |   240 |
| `514a029` | Card audit result recorded                                       | —                                                |     — |

## Module 12 final gate

Run on a clean tree at `514a029`, 18 Oct 2026, Windows, Node 24, mock/file adapters, fake clock `2026-10-16T09:00:00+05:30`.

| Check | Result |
|---|---|
| `npm ci && npm run build && npm run typecheck && npm run lint` | PASS |
| `npm test` ×3 consecutive | PASS, PASS, PASS (9 / 10 / 69 / 8 / 3 test files per package each time) |
| `npx vitest run --sequence.shuffle` (server) | PASS, seed `1792341806953`, 69 files / 174 tests |
| `npm run validate:packs` | PASS, no schema errors; 59 starter values remain unverified (👤) |
| `npm run demo:check` | PASS, 15/15, exit 0 |
| `npm run bench` | PASS, 7/7 tools under 500 ms p95; highest diagnosis at 85 ms |
| `npm run smoke` ×2 against one server | PASS, PASS |
| `npm run keys:check` | 0 configured, 9 missing, **0 malformed**, no code errors |
| `npm run preflight` | **0 CODE problems**, 8 credential gaps, 4 mock-driver warnings |

Test total: **240** (schema 26 / server 174 / ui 6 / phone 19 / simulator 15). The rise from 217 at Module 10 is 23 added regression tests; none was removed, skipped or weakened.

## Module 12 Phase 1: Gate A closed
All eleven approved Gate A fixes are applied; the per-item outcome table is in [audit/final-audit.md](audit/final-audit.md). Nine are FIXED, three ACCEPTED with reasons, and the remaining register rows are credential-blocked (🔑 A-12, A-13) or user-owned (👤 A-14 to A-18). No ❌ or ⚠️ rows remain.

The two most instructive fixes were the same bug: the privacy Journey 6 flake was **not** a test-isolation problem but a real redaction defect. A UUID whose first segment happens to be eight digits matched the phone-number heuristic, so `confirmationId` was rewritten to `[REDACTED_PHONE]` inside the tool result and the destructive confirmation could never be completed. The MCP Inspector CLI run (fix 1.8) made it visible; no test was weakened to make it pass.

Test total after Phase 1: **223** (schema 26 / server 157 / ui 6 / phone 19 / simulator 15), up from 217 because six regression tests were added. The full suite passed three times consecutively plus once with `--sequence.shuffle`.

Schema coverage rerun on 2026-10-18 (`npm run coverage -w @ellie/schema`): 97.58 % statements and lines, 87.61 % branches, 95.74 % functions — above the Module 2 target of 90 % lines.

Module 1–6 prompts: `git log --all --diff-filter=A -- docs/prompts/` shows these files were only ever committed as condensed execution briefs. No fuller original exists in history to recover, and none was fabricated. `docs/prompts/module-9.md` never existed in any commit and is now a labelled reconstruction.

## Module 11 Phase A

Audit evidence and proposed fixes: [audit/final-audit.md](audit/final-audit.md). Full gate discovered 217 tests, unchanged from Module 10: 216 passed and one server privacy integration test failed. Its isolated rerun passed, but the full-run failure remains open. Build, typecheck, lint, pack validation and all 15 demo steps passed. Smoke failed on repeated fixed-household send dedupe. All seven mock benchmark p95 values were below 500 ms; the highest was diagnosis at 101 ms. No live AWS timings were measured.

The fresh clone installed, built, seeded, served `/sim/` and passed the first presenter step in the integrated browser. Inspector UI, Docker runtime, real microphone rehearsal and public/live AWS paths were not run. No code fixes were applied and no release tag was created. Phase B must wait for approval at Gate A.

### Schema Test Count: C7

The monorepo has 26 schema tests; the standalone extract has 22. Extraction omits three Headsup phone-only tests from `packages/schema/test/phone.test.ts` and two mixed Headsup-specific contract tests from `packages/schema/test/contracts.test.ts`, then adds one generic standalone contracts test: **26 - 3 - 2 + 1 = 22**. This is an intentional scope difference, not four unexplained failing or skipped tests. Standalone typecheck, all 22 tests, pack validation and JSON Schema stability passed. Its seven dev/test-toolchain dependency advisories remain approval-gated; details are in the audit.

Module 5 AC preferred-month regressions: “keeps March 30 AC service due date in March without shifting preferred months” and “shifts May 10 AC service to March 1 and records the preferred-month rule”.
Module 6 follow-ups committed separately as `2df8b37`: explicit app/wall TTL clock, schema 1.4.1, phone smoke, AC regression names, and read-only AWS check.
Module 7 follow-ups were committed separately as `334f0ce` before Module 8 implementation.

Module 7 §0 traceability:

- `ttlClock`: `packages/server/src/adapters/storage/types.ts` (`StoredRecord`) and `packages/server/src/data/keys.ts` (`ttlClockForKey`); contract test `supports put/get, sorted prefix queries, limits, pagination, TTL, and partition deletion` in `packages/server/test/storage.contract.test.ts`.
- Schema 1.4.1: `packages/schema/CHANGELOG.md` and `packages/schema/src/version.ts`.
- Phone smoke: `scripts/smoke.ts`, run with `npm run smoke`.
- AC rules: `keeps March 30 AC service due date in March without shifting preferred months` and `shifts May 10 AC service to March 1 and records the preferred-month rule` in `packages/server/test/prediction.rules.test.ts`.
- Read-only AWS check: `scripts/aws-check.ts`, run with `npm run aws:check`.
- Accessibility: five phone view states in `packages/phone/test/a11y.test.tsx`; axe reports no violations.
- MCP Apps host rendering: external host not available in Module 7; Module 8 Host view will exercise the bundled resource and record the host bridge/action result.

Module 8 implementation committed as `9035db5`; schema 1.6.0, simulator, MCP loopback orchestration, tests, and Host view are covered by `docs/prompts/module-8.md`.

Module 3 note: DynamoDB Local contract suite is available but was not run in the build environment because Docker is unavailable.
