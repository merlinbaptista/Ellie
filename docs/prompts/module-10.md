# Ellie — Module 10: Demo Runner, Go-Live, Schema Repo & Submission

> **How to use this file**
> 1. Module 9 must be committed (`8af3529` follow-ups, `086e048` Module 9, `658e6a7` docs; tests: schema 26, server 142, UI 6, phone 19, simulator 11).
> 2. Save this file as `docs/prompts/module-10.md`.
> 3. In **Copilot Chat → Agent mode** send:
>    `Implement everything in #file:docs/prompts/module-10.md exactly. Follow #file:.github/copilot-instructions.md. Do section 0 first and commit it separately, then work section by section. Sections marked [YOU] need the user — prepare everything, then stop and list what the user must do. Make new commits; do not amend.`
> 4. Work through the **[YOU]** steps yourself, then tick the **Definition of Done**.

---

## 0. Module 9 review fixes (do these first, commit as `Module 9 follow-ups`)

Module 9 is accepted. Three items are still open from its prompt.

### 0.1 OAuth live check (Module 9 §13 rows 12–13, §16)
The summary doesn't show the optional OAuth check was run. Run it now with the dev issuer:
1. `OAUTH_ENABLED=true` with the dev issuer settings from Module 9 §16, then `npm run dev:token -- --household demo-blr`.
2. `curl -i http://127.0.0.1:8787/mcp` → 401 with `WWW-Authenticate: Bearer resource_metadata=…`.
3. `GET /.well-known/oauth-protected-resource` → the metadata document.
4. With the token, `get_history { householdId: "demo-tx" }` → "I can only see your own home."

Record the results (and whether SDK v1 auth helpers were used or hand-rolled) in `docs/friction-log.md`. Turn OAuth off again.

### 0.2 Screenshots [YOU]
Playwright's Chromium isn't installed in the build environment. Leave the script as is. Add a line to `docs/rehearsal-checklist.md`: "Run `npx playwright install chromium` then `npm run screenshots` with the server running." The final README (§7) must still render cleanly if the images are missing (use alt text and don't break layout).

### 0.3 Test totals
Add a "Total" column to the commit-history table (Module 9 = 204) and keep the per-package counts.

---

## 1. Goal of this module

Turn the working project into a **demo-ready, submittable release**. After this module:

1. **Presenter mode** plays the demo script step by step in the simulator, with one key press per step and a fallback if voice fails.
2. `npm run demo:check` runs the whole demo headlessly and fails if any spoken answer, card or timing is off.
3. The **59 unverified pack values** are either verified with a source, removed, or clearly kept as labelled starter defaults. Nothing in the demo relies on an unchecked fact.
4. `npm run preflight` checks a production configuration before going live.
5. `npm run bench` proves every tool stays under 500 ms (p95) on the chosen storage.
6. **Docker** image and compose file run Ellie with one command.
7. A **public HTTPS URL** (tunnel) lets Alexa+ and judges reach the server, with production settings.
8. **AWS go-live**: DynamoDB, Bedrock, SNS and EventBridge switched on and checked with `npm run aws:check`.
9. The `@ellie/schema` package is extracted into a standalone **`home-event-schema` open-source repo** with CI.
10. Final **README**, architecture diagram, friction log, submission write-up and 3-minute demo video script.
11. Tagged release `v1.0.0`.

### Scope guard
No new product features. Only demo tooling, data verification, packaging, deployment, docs and fixes for bugs found while rehearsing.

### Day plan (from the project plan: Wed 21 – Thu 22 Oct)
| When | Work |
|---|---|
| Wed morning | §0, §2 presenter mode, §3 `demo:check` |
| Wed afternoon | §4 pack verification, §5 preflight + bench |
| Wed evening | §6 Docker + tunnel, §8 AWS go-live [YOU] |
| Thu morning | §9 schema repo, §7 README, §10 submission docs |
| Thu afternoon | Full rehearsal ×3 [YOU], record video [YOU], tag release |

---

## 2. Presenter mode (simulator)

### 2.1 Demo script file
`demo/script.json` (validated by a Zod schema in `packages/server/src/demo/script.ts`):
```ts
const DemoStep = z.object({
  id: z.string(),
  title: z.string(),                         // shown to the presenter only
  household: z.enum(["demo-blr", "demo-tx", "fresh"]),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("say"), text: z.string() }),
    z.object({ kind: z.literal("timeTravel"), to: z.string().nullable() }),   // null = reset
    z.object({ kind: z.literal("openPhone"), which: z.enum(["latest"]) }),
    z.object({ kind: z.literal("phoneTap"), action: z.enum(["fixed", "booked", "book"]) }),
    z.object({ kind: z.literal("reseed") }),
  ]),
  expect: z.object({
    tools: z.array(z.string()).optional(),               // exact order
    speechIncludes: z.array(z.string()).optional(),       // case-insensitive
    speechExcludes: z.array(z.string()).optional(),
    state: z.enum(["done", "awaiting_answer", "safety_stop", "not_understood"]).optional(),
    cards: z.number().int().optional(),
    maxToolMs: z.number().default(500),
    outboxNew: z.number().int().optional(),
  }).default({}),
  presenterNote: z.string().optional(),       // what to say to the audience
});
```

### 2.2 The script (about 3 minutes)
| # | Household | Action | Expect | Presenter note |
|---|---|---|---|---|
| 1 | — | reseed + time travel reset | — | (setup, hidden) |
| 2 | demo-blr | say "What's due this week?" | `due_this_week`; "3 months overdue", "due today" | "Normal reminders remember a time. Ellie remembers your home." |
| 3 | demo-blr | say "The cylinder's changed and the purifier is beeping again" | `log_event`, `diagnose`; "23 November", "filter", "March", "20 December"; 2 cards | "One sentence, two jobs — and it used the household's own history." |
| 4 | demo-blr | say "Send it to my phone" | `send_to_phone`; outboxNew 1 | "Long content goes to the phone." |
| 5 | demo-blr | openPhone latest | — | "Steps, parts, warranty — and a chat that only answers from this fix." |
| 6 | demo-blr | phoneTap fixed | — | |
| 7 | demo-blr | timeTravel `2026-11-18T09:05:00+05:30` | outboxNew 1 | "Day 30: the reminder arrives with a one-tap WhatsApp booking." |
| 8 | demo-blr | openPhone latest → phoneTap book | — | "That's India's 25-day booking rule, from the region pack." |
| 9 | demo-blr | timeTravel null | — | |
| 10 | demo-blr | say "I can smell gas" | state `safety_stop`; "1906"; tools `diagnose` only | "Safety always comes first." |
| 11 | demo-tx | say "The gas tank got refilled" | "propane tank" | "Same schema, Texas: gallons, propane, 911." |
| 12 | demo-blr | say "What do you know about my home?" | `what_do_you_know` | "And the user stays in control." |
| 13 | — | reseed | — | (clean up) |

Adjust expected strings to the actual current output **only** if the meaning is the same; otherwise fix the code.

### 2.3 UI
- Press `P` in the simulator (non-production, or production with the access code) → a presenter strip at the bottom:
  - current step title and presenter note, a step counter, **Next** (→ key), **Back**, **Restart**
  - for `say` steps: "Speak now" (mic opens) **and** "Use chip" (sends the text) — so a misheard word never breaks the demo
  - after each step: ✔ or ✖ against `expect`, with the reason on hover
- The presenter strip is hidden from the Echo Show frame area so it doesn't appear in a screen recording crop.
- `F` toggles a full-screen layout (Echo Show + phone side by side, no dev panels).

---

## 3. `npm run demo:check` (headless)

`scripts/demo-check.ts`:
- Starts nothing itself; expects the server at `ELLIE_DEMO_URL` (default `http://127.0.0.1:8787`).
- Runs `demo/script.json` through `/api/sim/turn` and the dev/phone APIs (phone taps via the phone API with the link token from the outbox mirror — test-only path, non-production).
- Prints a table: step, tools, ms, ✔/✖, reason. Exit 1 on any ✖.
- Writes `demo/last-run.json` (gitignored) for the friction log.
- Add an integration test that runs the same script against an in-process server (serial project).

---

## 4. Region-pack verification (the 59 values)

Copilot must **not** mark a value verified from memory. Facts must come from an official source the user has checked.

### 4.1 Report
`npm run packs:report` → `docs/pack-verification.md`, one row per `verified:false` value:

| Pack | Path | Value | Used in demo? | Note | Proposed source to check | Decision | Checked by / date |
|---|---|---|---|---|---|---|---|

- "Used in demo?" = yes if `demo/script.json` or the seed touches it (e.g. IN `lpg_cylinder`, `indane`, gas number, `ro_purifier`, US `propane_tank`).
- "Proposed source" = the kind of official page to look at (e.g. "Indane official website — WhatsApp booking"), not an invented URL.
- Decision column options: `verify` / `keep-default` / `remove`.

### 4.2 [YOU] Decide
Fill the Decision column. For `verify`, paste the URL you checked.

Priorities:
1. Every value **used in the demo**: verify, or change the demo so it doesn't state it as fact.
2. Emergency numbers (IN gas 1906, 112, US 911, UK gas line): verify or remove — never guess.
3. The US propane supplier phone number is a placeholder: keep it clearly labelled "demo placeholder" in the card, or remove the `tel:` action.
4. Everything else: `keep-default` is fine; the region-pack README already explains starter defaults.

### 4.3 Apply
`npm run packs:apply` reads the filled table:
- `verify` → set `verified: true`, `url`, `checkedOn`
- `remove` → delete the value (and anything depending on it; `validate:packs` must still pass)
- `keep-default` → unchanged

Re-run `validate:packs`; record the new unverified count in `docs/modules.md`. Speech for any `keep-default` interval stays phrased as "usually about…", never as a rule.

### 4.4 Translations
The Hindi, Kannada, Tamil and Spanish UI strings are starter translations. Add them to the same report (one row per file). [YOU] get a native speaker to review the ones shown in the demo (Kannada at least), or switch the demo to English and say translations are a preview.

---

## 5. Preflight and benchmark

### 5.1 `npm run preflight`
Checks the current `.env` for a production go-live and prints ✔/✖/⚠:
- `NODE_ENV=production`
- `LINK_SIGNING_SECRET` ≥ 32 chars and not the default
- `ELLIE_PUBLIC_BASE_URL` is `https://` and its host is in the DNS-rebinding allow list
- `HOST` binding sensible for the deployment (`0.0.0.0` in Docker, otherwise `127.0.0.1` behind the tunnel)
- `/sim` gated (disabled, or `SIM_ACCESS_CODE` ≥ 12 chars)
- dev routes and `ellie_dev_time_travel` off (verify by calling them and expecting 404)
- `CORS_ORIGINS` has no `localhost` in production (⚠ only)
- driver table: each service `aws` or `mock`, with a ⚠ for any mock in production
- `ELLIE_FAKE_NOW` empty (⚠ if set — useful for a demo but not for real use)
- OAuth on/off stated
Exit 1 on any ✖. Never print secret values.

### 5.2 `npm run bench`
- Connects as an MCP client (Streamable HTTP) to `ELLIE_BENCH_URL`.
- For each read tool and the main write tools (`due_this_week`, `predict_next`, `get_history`, `log_event`, `diagnose`, `send_to_phone`, `what_do_you_know`): 30 calls on demo-blr after 3 warm-ups. Write calls use a throwaway household `hh_bench-<random>` and are erased afterwards with `forget_household`.
- Prints p50 / p95 / max per tool; ✖ when p95 > 500 ms.
- Writes `docs/bench.md` with the date, storage and LLM driver, and the table. Run it for mock/file and (after §8) for DynamoDB + Bedrock.

---

## 6. Docker and public HTTPS

### 6.1 Dockerfile (multi-stage)
- Build stage: `node:22-slim`, `npm ci`, `npm run build`.
- Runtime stage: `node:22-slim`, production dependencies only, copy the built `dist` folders of server, schema, ui-consuming apps (phone, mcp-app, simulator builds).
- Non-root user, `NODE_ENV=production`, `EXPOSE 8787`, `HEALTHCHECK` calling `/health`.
- `.dockerignore`: `node_modules`, `.env*`, `data`, `coverage`, `.git`, `docs/images`.
- Target image size noted in the friction log.

### 6.2 `docker-compose.yml` (extend the Module 3 file)
- Service `ellie`: build `.`, `env_file: .env`, port `8787:8787`, volume `./data:/app/data` (file store), `HOST=0.0.0.0`.
- Keep `dynamodb-local` under an optional profile `local-db`.
- `npm run docker:up` / `docker:down` scripts.

### 6.3 Public HTTPS via tunnel [YOU]
Document both options in `docs/DEPLOY.md`; the user picks one:
- **Cloudflare Tunnel** quick tunnel: `cloudflared tunnel --url http://localhost:8787` (prints an `https://…trycloudflare.com` URL).
- **ngrok**: `ngrok http 8787`.

Steps after the tunnel starts:
1. Set `ELLIE_PUBLIC_BASE_URL=https://<tunnel-host>` (and `SHORT_LINK_BASE_URL` blank so it follows).
2. Add the tunnel host to the allowed hosts list (DNS-rebinding guard).
3. Restart, run `npm run preflight`, then `npm run smoke` with `ELLIE_MCP_URL=https://<tunnel-host>/mcp`.
4. Open a short link on your real phone over mobile data.
Note in the doc: quick-tunnel URLs change on restart; update `.env` each time, or use a named tunnel / fixed domain for the judging period.

### 6.4 Connecting Alexa+ [YOU]
Ellie exposes a standard MCP server over Streamable HTTP at `https://<host>/mcp` (spec 2025-11-25). Connect it using the **official Alexa+ MCP / hackathon connector documentation**. Copilot must not invent Alexa-specific console steps. `docs/DEPLOY.md` gets a placeholder section "Alexa+ connection" with: the MCP URL, auth mode (none or OAuth from Module 9), and blank lines for the steps the user follows from the official docs. After connecting, repeat demo steps 2–4 and 10 on a real device and note the results in the rehearsal checklist. If Alexa+ access isn't available in time, the simulator demo stands on its own — say so plainly in the submission.

---

## 7. Final README

Rewrite `README.md` top to bottom (keep the detailed sections from earlier modules, moved under `docs/` where long):
1. **One-liner + 3 bullets** (remembers, predicts, diagnoses — and hands off to the phone).
2. **Screenshots** (from `docs/images`, if present).
3. **Demo in 60 seconds**: `npm install && npm run build && npm run seed:reset && npm run dev`, open `/sim/`, press `P`.
4. **Architecture** as a Mermaid diagram: Alexa+ / simulator / MCP hosts → `/mcp` (Streamable HTTP) → tools → domain (memory, prediction, diagnosis, privacy) → adapters (DynamoDB, Bedrock, SNS, EventBridge→SQS) ; phone page ← signed links.
5. **Tools table**: all MCP tools with one line each and annotations (read-only / destructive).
6. **Journeys**: Journey 1 (first change + one question), Journey 2 (diagnosis from history), Journey 3 (phone + booking), privacy flows.
7. **Region packs** and the link to the `home-event-schema` repo (§9).
8. **Mock vs AWS** driver table and go-live checklist (link `docs/DEPLOY.md`).
9. **Safety and privacy** summary (link `docs/PRIVACY.md`).
10. **Quality**: test counts per package, `bench` table, `demo:check` result.
11. **Honest limitations**: starter pack values, translation review status, what wasn't tested live (fill from the friction log), SMS sandbox/DLT, Alexa+ connection status.
12. **License** MIT.

---

## 8. AWS go-live [YOU, with Copilot preparing]

Copilot prepares `docs/DEPLOY.md` "AWS" section and a combined CloudFormation entry point; the user runs it.

1. Choose one region where your chosen Bedrock model is available; use it for everything.
2. Deploy stacks: `infra/dynamodb-table.yaml` (Module 3) and `infra/ellie-messaging.yaml` (Module 6). Add `npm run aws:deploy` that deploys both in order with the AWS CLI (prints the commands it runs; requires `--yes` to execute).
3. Create one IAM user or role for the server; attach `iam-policy-dynamodb.json`, `iam-policy-bedrock.json`, `iam-policy-messaging.json`. Add `npm run aws:policy` that merges them into `infra/iam-policy-all.json`.
4. Enable model access for the chosen model in the Bedrock console.
5. `npm run aws:env -- --stack ellie-messaging` → paste into `.env`; add `DYNAMODB_TABLE_NAME`, `BEDROCK_MODEL_ID`, credentials or `AWS_PROFILE`.
6. `npm run aws:check -- --bedrock` → all ✔.
7. `npm run seed:reset` (now into DynamoDB), `npm run dev`, banner shows `aws` for all four services.
8. `npm run demo:check` and `npm run bench` → record both in `docs/bench.md`.
9. Confirm the SNS email subscription; trigger demo step 7 (reminder) and see the email.
10. If anything fails, switch only that service back to mock (`*_DRIVER=mock`) for the demo and record it in the friction log and README limitations.

Cost note in the doc: DynamoDB on-demand, SNS and Scheduler costs are tiny at demo volume; Bedrock is billed per token — keep `BEDROCK_MAX_TOKENS` low and remember to delete stacks after judging (`npm run aws:destroy` with `--yes`, prints what it deletes).

---

## 9. Open-source schema repo (`home-event-schema`)

### 9.1 Extraction script
`npm run schema:extract -- --out ../home-event-schema` creates a clean standalone repo (no Ellie history):
- **Include**: primitives, enums, household, item, event, prediction, resolution, diagnosis, privacy (`ConsentRecord`, `DataInventory`, `ForgetReceipt`), region-pack schema/merge/registry, packs, catalog matching, date/unit/id/format helpers, contracts that are generic (`LogEventInput`, `GetHistoryInput`, `PredictNextInput`, `DiagnoseInput`, `LogResolutionInput`, `DueThisWeekInput`, `SetupHouseholdInput`).
- **Exclude**: `sim.ts`, `phone.ts`, Ellie-only contracts (`SendToPhoneInput`, privacy tool inputs), anything importing server code. Fail the script if an excluded file is imported by an included one.
- Rename the package to `home-event-schema` (version `1.0.0`), keep MIT, keep JSON Schema output and `validate:packs`.
- Copy the relevant tests; they must pass standalone.

### 9.2 Repo contents
- `README.md` (standalone, from the Module 2 package README, updated): what it is, install, examples, region-pack format, **how to add a region**, data rules (no personal data, every fact has a source, `verified:false` = starter default).
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md`, `CHANGELOG.md`.
- `.github/workflows/ci.yml`: Node 20 and 22; install, typecheck, test, `validate:packs`, JSON Schema up to date (`git diff --exit-code` after `gen:jsonschema`).
- `.github/ISSUE_TEMPLATE/new-region.yml` (form: country, items, providers with sources, emergency numbers with sources).
- `examples/` with a minimal Node and a minimal browser example.

### 9.3 Ellie uses it
Keep `packages/schema` in the monorepo as the source of truth for now; add a note in both READMEs explaining the sync (`schema:extract` is re-run for each release). [YOU] create the GitHub repo and push.

---

## 10. Submission documents

### 10.1 `docs/SUBMISSION.md`
Draft text the user edits — **don't invent hackathon rules, categories or deadlines**; leave `<!-- check official rules -->` placeholders where those matter.
- Project name, one-liner, problem, solution, who it helps (India and US households)
- How it uses MCP (Streamable HTTP, tools with annotations, resources, MCP Apps view, OAuth option) and AWS (DynamoDB, Bedrock with cited answers, SNS, EventBridge Scheduler → SQS)
- What's novel: household history over generic reminders, region packs, cited diagnosis, safety gate, one-question rule, privacy controls
- Open-source contribution: `home-event-schema` link
- Testing and quality: test counts, bench p95, `demo:check`
- Limitations (from README)
- Links: repo, schema repo, video, live URL (if any)

### 10.2 `docs/VIDEO_SCRIPT.md` — 3 minutes
Shot list aligned with §2.2: 0:00 hook (problem) → 0:20 due this week → 0:40 hero sentence → 1:20 phone fix page + chat → 1:50 day-30 reminder + WhatsApp booking → 2:15 gas safety stop → 2:30 Texas switch → 2:45 privacy → 2:55 close. Each shot: what's on screen, what you say (≤ 25 words), presenter-mode step number. Recording tips: full-screen layout (`F`), mute dev panels, system audio on for Ellie's voice.

### 10.3 Friction log final pass
Group `docs/friction-log.md` entries by area (MCP SDK, MCP Apps, AWS, browser voice, tooling), add a short summary at the top with the 5 most useful findings, and make sure every row has severity and a suggestion. [YOU] review before submitting.

---

## 11. Release
- Bump all workspace versions to `1.0.0` (schema keeps its own semver; note the mapping in `CHANGELOG.md`).
- Root `CHANGELOG.md` summarising Modules 1–10.
- `git tag -a v1.0.0 -m "Ellie 1.0.0 — hackathon submission"` (after the user confirms §12 is done). [YOU] push tags.

---

## 12. Tests
| File | Must cover |
|---|---|
| `demo.script.test.ts` | `demo/script.json` validates; every `say` step's tools exist; household ids valid |
| `demo.check.integration.test.ts` | runs the full script in-process; all steps ✔ (serial project) |
| `packs.report.test.ts` | report lists every `verified:false` value; "used in demo" detection; `packs:apply` handles verify/remove/keep and `validate:packs` still passes after a sample remove |
| `preflight.test.ts` | each check with good/bad env fixtures; never prints secrets |
| `bench.test.ts` | percentile maths; throwaway household erased afterwards |
| `schema.extract.test.ts` | extracted tree has no excluded files; no imports of excluded modules; its tests pass (run with `vitest --root <out>` in a temp dir) |
| simulator `Presenter.test.tsx` | step navigation, chip fallback, ✔/✖ display, hidden in production without the access code |
| `docker.test.ts` (optional, skipped without Docker) | image builds, `/health` 200 |

All earlier tests stay green.

---

## 13. Verification
```bash
npm install
npm run build && npm run typecheck && npm run lint && npm run validate:packs
npm test
SEED_ANCHOR_DATE=2026-10-16 npm run seed:reset
ELLIE_FAKE_NOW=2026-10-16T09:00:00+05:30 npm run dev
npm run smoke
npm run demo:check
npm run bench
npm run packs:report
npm run schema:extract -- --out ../home-event-schema && (cd ../home-event-schema && npm install && npm test)
```
Then the [YOU] list:
1. Fill `docs/pack-verification.md` → `npm run packs:apply`.
2. `npx playwright install chromium && npm run screenshots`.
3. Docker: `npm run docker:up` → open `/sim/`.
4. Tunnel + `npm run preflight` + phone test over mobile data.
5. AWS go-live (§8) → `aws:check`, `demo:check`, `bench` on AWS.
6. Alexa+ connection (if available) per official docs.
7. Rehearse three times with `docs/rehearsal-checklist.md` (voice, then chips).
8. Record the video; fill `docs/SUBMISSION.md`; review the friction log.
9. Create and push `home-event-schema`; push the tag.

---

## 14. Definition of Done — Module 10
- [ ] §0 follow-ups committed separately (OAuth live check recorded, screenshot note, totals column)
- [ ] Presenter mode with chip fallback; `demo/script.json`; `demo:check` passes locally
- [ ] Pack verification report produced; demo-used values and emergency numbers verified or removed [YOU]; new unverified count recorded
- [ ] `preflight` and `bench` scripts; `docs/bench.md` with p95 < 500 ms per tool (mock and AWS)
- [ ] Dockerfile + compose; image runs and passes `/health`
- [ ] `docs/DEPLOY.md` with tunnel, AWS go-live, Alexa+ placeholder section; `aws:deploy`, `aws:policy`, `aws:destroy` scripts
- [ ] AWS services checked live with `aws:check` [YOU]; any fallback to mock documented
- [ ] `home-event-schema` extracted with CI, contributing docs and passing tests; pushed [YOU]
- [ ] Final README, `docs/SUBMISSION.md`, `docs/VIDEO_SCRIPT.md`, friction log summary
- [ ] Three rehearsals done; video recorded [YOU]
- [ ] All tests green; `v1.0.0` tagged; commit: `git commit -m "Module 10: demo, release and submission"`
