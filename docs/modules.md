# Module roadmap

| # | Module | Delivers | Status |
|---|---|---|---|
| 1 | Foundation & MCP skeleton | Monorepo, config, driver switch, adapter interfaces + mocks, MCP Streamable HTTP server, ping/status, tests, VS Code setup | ✅ |
| 2 | Home-event schema & region packs | `@ellie/schema`: Zod types and IN/US/UK/default packs | ✅ |
| 3 | Household memory | Repositories, DynamoDB adapter, household/event tools, Bengaluru + Texas seed data | ✅ |
| 4 | Prediction engine | Due dates, time-zone maths, regional minimums, confidence, reminders | ✅ |
| 5 | Diagnosis engine | Symptom flows, safety rules, Bedrock adapter, diagnosis/resolution tools | ✅ |
| 6 | Phone handoff & scheduling | SNS, EventBridge Scheduler, booking links, signed phone links | ✅ |
| 7 | Phone fix page | Mobile page, steps, chat, booking, MCP Apps view | ✅ |
| 8 | Simulated Alexa+ web app | Browser voice, multi-intent, Echo Show cards, household switcher | ✅ |
| 9 | Privacy & trust | Knowledge and forget tools, consent, export, retention, optional OAuth 2.1 resource protection | ✅ |
| 10 | Demo & submission | Demo runner, time-travel scenarios, docs, schema extraction, Docker | ⏳ |

Module 10 verification: Verify or remove unverified pack values (59 after Module 5).

## Commit history

| Commit | Contents | Tests (schema / server / ui / phone / simulator) | Total |
|---|---|---|---:|
| `9291b85` | Module 5 diagnosis engine | — | — |
| `2993d55` | Module 5 follow-ups | — | — |
| `afdcac6` | Module 6 phone handoff and scheduling | — | — |
| `2df8b37` | Module 6 follow-ups | — | — |
| `7abecef` | Module 7 phone page, chat and MCP Apps | — | — |
| `334f0ce` | Module 7 follow-ups: CSP, axe checks, traceability, no-amend rule | — | — |
| `9035db5` | Module 8 simulated Alexa+ web app | 24 / 124 / 6 / 17 / 11 | 182 |
| `cfdddfb` | Module 8 completion status and history docs | — | — |
| `086e048` | Module 9: privacy and trust | 26 / 142 / 6 / 19 / 11 | 204 |

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
