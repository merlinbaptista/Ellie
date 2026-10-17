# Ellie — Module 11: Go-Live, Final Audit and Win Plan

> **Paste this whole file into GitHub Copilot (agent mode) in the Ellie workspace.**
> Save a copy as `docs/prompts/module-11.md` in your first commit.
> Work through the phases **in order**. Stop at every **🛑 STOP GATE** and wait for me.

---

## 0. Context you must know before touching anything

| Item | Value |
|---|---|
| Hackathon | Build, Ship, Shape: Amazon Developer Hackathon (Devpost) |
| Primary track | Alexa+ (self-hosted MCP server, spec 2025-11-25, Streamable HTTP, plus simulated Alexa+ web app) |
| Mini challenges | AWS Builder (Bedrock, DynamoDB, EventBridge Scheduler, SNS) and Open Source (`home-event-schema`, MIT) |
| Hard deadline | Fri 23 Oct 2026, 12:00 PDT = **Sat 24 Oct 2026, 00:30 IST** |
| My target | **Thu 22 Oct 2026, 21:00 IST** (Friday is buffer only) |
| Office hours #2 | Mon 19 Oct 2026, 09:00 PT = **21:30 IST** |
| Judging period | 9–20 Nov 2026. AWS resources must stay up until 20 Nov, then teardown |
| Today | Sat 17 Oct 2026, evening IST |

### Judging criteria (score everything against these)

1. **Technical implementation**: well built, uses the required tech effectively.
2. **Design**: complete, coherent experience, with the right interaction model for the device.
3. **Potential impact**: a credible, specific need, with an audience beyond the hackathon.
4. **Quality of the idea**: creative use of the tools, with an understanding of the ecosystem and end users.
5. **Bonus**: friction log, worth **up to 10%**.
6. **Stage 1 (pass/fail)**: a real MCP server on spec 2025-11-25 over Streamable HTTP, tools registered and called in code, simulator source in the repo, a working demo, a code repo, product feedback, and a video under 3 minutes.

Automated, AI-driven review may be part of judging, so README clarity and code quality count as much as the video.

### State after Module 10 (accepted)

- Commits: `c417b79` (Module 9 follow-ups), `c8ebd77` (Module 10), `a471bbd` (roadmap hash). No tag yet.
- Tests: **217**. Schema 26, server 151, UI 6, phone 19, simulator 15.
- `demo:check` passes all 15 steps. Mock bench highest p95 is 94 ms.
- Standalone `home-event-schema`: typecheck, 22 tests, pack validation and JSON Schema checks pass.

### Open items carried from Module 10 (must be closed or explicitly accepted in this module)

| # | Open item | Owner |
|---|---|---|
| C1 | 59 region-pack values still unverified; `pack-verification.md` decisions not made | [YOU] decide, Copilot applies |
| C2 | Kannada/other translations not reviewed by a native speaker | [YOU] or demo in English |
| C3 | Screenshots not taken (Chromium not installed) | [YOU] install, Copilot scripts |
| C4 | Docker image never built or run | [YOU] install Docker Desktop **or** README stops claiming it was tested |
| C5 | `npm run preflight` reports missing production config | This module |
| C6 | Dependency advisories in `home-event-schema` left unchanged | Copilot to triage (no forced upgrades) |
| C7 | Schema tests are 26 in the monorepo, 22 in the extract; difference not explained | Copilot to explain in `modules.md` |
| C8 | `SUBMISSION.md` placeholders, rehearsals, video, public repos | [YOU] with Copilot drafts |

---

## 1. Ground rules (unchanged from earlier modules, plus new ones)

1. **No `git commit --amend`. No force push.** Every fix gets its own commit.
2. **Never commit secrets.** `.env` stays git-ignored. Before every commit, run a secret scan: `git diff --cached` must not contain `AKIA`, `aws_secret`, `Bearer `, phone numbers or e-mail addresses. Add a pre-commit check if one does not exist.
3. **Mocks stay the default.** Each live service is switched on by its own flag. If a live call fails, the deterministic or mock path must still answer. The demo must never break because a key is missing or expired.
4. **Never mark a region-pack fact as verified from memory.** Only my decisions in `pack-verification.md` change verification status.
5. **Never invent Alexa+ setup steps.** Use only the official Alexa+ docs (URLs in Phase B4). If a doc page cannot be read, write `TODO: confirm from official docs` and tell me.
6. **Report honestly.** Say "not run" when something was not run. Do not write "verified" for anything you only reasoned about.
7. **Update `docs/friction-log.md` whenever something snags.** It is worth up to 10%.
8. After each phase, update `docs/modules.md` (commit-history table with hash and test totals) in a **separate** docs commit.

---

## Phase A — Final audit of Modules 1–10 (read-only first)

**Goal:** prove that every module is done and that the only thing missing is credentials and the user-owned steps.

### A1. Build the audit matrix

Create `docs/audit/final-audit.md` with one row per module:

| Module | Promised in its prompt (Definition of Done) | Evidence (file, test name, command output) | Status: ✅ done / ⚠️ partial / ❌ missing / 🔑 needs a key / 👤 user-owned | Fix needed |
|---|---|---|---|---|

Rules for filling it in:

- Read every `docs/prompts/module-N.md` and list **each** Definition of Done checkbox, not a summary.
- Evidence must be concrete: a test file and test name, a script and its output, or a file path. Run the command again now if it is cheap.
- Any item whose only blocker is a credential gets 🔑, not ❌.
- Any unticked checkbox in a module prompt must appear here with a reason.

### A2. Re-run the full gate on a clean tree

```bash
git status --short            # must be empty
npm ci
npm run build
npm run typecheck
npm run lint
npm test                      # record per-workspace counts and the total
npm run validate:packs
npm run demo:check
npm run bench
npm run smoke                 # with the dev server running at fake 09:00 IST
```

Record every count and timing in the audit. If the total is not 217, explain why.

### A3. Fresh-clone test (judges will do this)

1. Clone the repo into a new temporary folder (outside the workspace).
2. Follow the README **exactly as written**, with no extra knowledge.
3. Log every step that fails or is unclear in the audit and the friction log, then fix the README.

### A4. Specific checks

- [ ] MCP server: protocol version `2025-11-25`, Streamable HTTP on `POST /mcp`, tools have JSON schemas, structured output, annotations (read-only hints) and descriptions.
- [ ] MCP Inspector can connect, list tools and call each one. Save the output as evidence.
- [ ] Safety gate is code, not a prompt, and has tests for gas, electrical and water-near-power cases.
- [ ] Privacy: the privacy audit test still passes, and logs and Bedrock prompts are redacted.
- [ ] C7: explain the 26 vs 22 schema-test difference in `modules.md`.
- [ ] C6: list each `home-event-schema` advisory with severity, whether it is runtime or dev-only, and a recommendation. Do **not** run `npm audit fix --force`.

### 🛑 STOP GATE A

Show me the audit summary table, counts per status, and the list of ❌ and ⚠️ items with your proposed fixes. **Fix only after I approve.** Commit: `audit: final module verification` (docs) and `fix: <item>` (one per fix).

---

## Phase B — API readiness: inventory, guide and live switches

**Goal:** I can paste keys into `.env`, run one command per service, and know each one works.

### B1. Inventory every external dependency from the code, not from memory

Search the whole workspace for `process.env`, config schemas, `.env.example`, `@aws-sdk/*` clients, `fetch(` to external hosts, and any OAuth or tunnel config. For **each** variable, record:

| Variable | Service | Used in (file) | Required for | Default/mock behaviour | Secret? | Where to get it |
|---|---|---|---|---|---|---|

Flag:

- variables used in code but missing from `.env.example`
- variables in `.env.example` that nothing uses
- any secret that is logged, returned by a tool, or sent to Bedrock (must be none)

### B2. Write `docs/API_SETUP.md`, my step-by-step key guide

Write it for a first-time AWS user on Windows. Use this structure for each service:

1. **What Ellie uses it for** (one sentence) and which demo step depends on it.
2. **Cost**: free-tier status and a realistic cost for a 6-week hackathon. Link the official pricing page; do not invent prices.
3. **How to get it**: numbered console steps that name the exact console pages. Link the official AWS docs page for each step.
4. **What to paste into `.env`**: exact variable names.
5. **How to verify it**: the exact command (see B3) and the expected output.
6. **Fallback**: what happens if it fails during the demo.
7. **Teardown after 20 Nov**.

The guide must cover, in this order (add anything else B1 finds):

| Order | Service | Notes Copilot must address |
|---|---|---|
| 0 | **AWS account safety** | Root MFA; an **AWS Budget alert (e.g. USD 10)** before anything else; one region for everything (recommend `us-east-1` for the widest Bedrock availability, unless the code assumes another region) |
| 1 | **IAM** | A dedicated IAM user or role for Ellie using the merged least-privilege policy from Module 10. Never root keys. Explain access keys vs `aws configure sso` and which one Ellie supports |
| 2 | **Amazon Bedrock** | Model access for the exact model ID in config, including any first-use form. Verify the model is available in the chosen region. Show how to test with one Converse call |
| 3 | **Amazon DynamoDB** | Table names, keys, on-demand mode, the create script, and seeding demo households into the live table |
| 4 | **EventBridge Scheduler** | Schedule group, the execution role it assumes, the target, and how a predicted reminder becomes a schedule |
| 5 | **Amazon SNS (SMS and/or e-mail)** | **Check the current official docs and write down:** the SMS sandbox and verified destination numbers, spend limits, and any rules for sending SMS to Indian numbers (sender ID or template registration). If SMS to my number is not feasible by Thursday, use **e-mail via SNS** or a verified sandbox number, and say so in the README |
| 6 | **Public HTTPS tunnel** | `cloudflared` quick tunnel (recommended in the Alexa+ docs for local development) or ngrok. Set the public base URL variable so phone links use HTTPS |
| 7 | **OAuth 2.1 (optional)** | Which authorization server Ellie expects (built-in test issuer or external), and the variables to set |
| 8 | **Alexa+ connection** | See B4 |
| 9 | **GitHub** | Two public repos, MIT licence visible in About, and the reviewer invite list if either stays private |

### B3. One verification command per service

Extend the existing scripts (do not duplicate them):

```bash
npm run keys:check            # reads .env, says which services are configured, never prints secret values
npm run aws:check             # existing; extend so each service reports PASS / FAIL / SKIPPED with reason
npm run aws:check -- --only=bedrock|dynamodb|scheduler|sns
npm run preflight             # production config; must pass before Phase D
```

Requirements:

- Mask every secret in output (first 4 characters plus `…`).
- Each failure prints the **likely cause and the fix** (for example `AccessDeniedException → model access not granted in the Bedrock console for <modelId> in <region>`).
- Exit code is non-zero if any **enabled** service fails.
- Add tests for the masking and the reporting logic (mock the SDK).

### B4. Alexa+ conformance check (important)

Read the official pages (do not rely on memory):

- Alexa+ MCP QuickStart Guide: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
- Alexa+ MCP Toolkit Overview: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html

Then build a table in `docs/DEPLOY.md` § Alexa+: **each requirement → how Ellie meets it → test or evidence → gap**. Check at least these:

- [ ] Streamable HTTP, spec 2025-11-25, reachable at a remote URL.
- [ ] MCP Apps standard for visuals (`@modelcontextprotocol/ext-apps`).
- [ ] **401 behaviour for unauthenticated requests.** The QuickStart's auth checklist describes the 401 response, including whether a `WWW-Authenticate` header is present. Compare it with what Ellie's Module 9 OAuth returns (the MCP spec's own guidance may differ). If they conflict, **do not silently change it**: add a config option, default it to the Alexa+ behaviour when `ALEXA_MODE=true`, test both, and record the conflict in the friction log and product feedback.
- [ ] Protected Resource Metadata at the RFC 9728 well-known URI.
- [ ] `/.well-known/oauth-authorization-server`, with `code_challenge_methods_supported` including `S256`.
- [ ] OAuth 2.1 authorization code with PKCE (S256), the `resource` parameter, and `scopes_supported` handling.
- [ ] Bearer token on every authenticated request.
- [ ] Performance target from the docs (the concept document assumed **under 500 ms**; confirm the exact figure).
- [ ] Onboarding path: Add-on Agent Skill or the Alexa AI CLI (`addon.json`, `alexa-ai deploy`). Document the steps **only from the docs**.
- [ ] Availability: the Toolkit is documented as US-only. State plainly in the README that the live connection may not be possible from India and that the simulated Alexa+ web app is the permitted demo path.

### B5. Latency safety with real Bedrock (likely gap)

Mock p95 is 94 ms, but real Bedrock calls can take much longer. Make sure:

- [ ] Every tool returns its **code-computed facts** within the latency budget, even if Bedrock is slow.
- [ ] Bedrock calls have a timeout (configurable, for example 1,500 ms for the simulator). When it is hit, the deterministic answer is used and the event is logged.
- [ ] `npm run bench -- --live` measures p50/p95 per tool with real AWS and writes the results to `docs/bench.md` with the date, region and model.
- [ ] If any tool's p95 is over the Alexa+ budget, propose a fix (caching, pre-computed causes, async explanation) before Phase D.

### 🛑 STOP GATE B

Show me the B1 inventory, the table of contents of `API_SETUP.md`, the B4 conformance table with gaps, and the B5 plan. Commit: `feat: keys:check and per-service aws:check`, `docs: API setup guide`, `fix(oauth): Alexa+ 401 mode` (if needed). Then **wait while I add keys (Phase C).**

---

## Phase C — [YOU] Key entry session (about 2–3 hours)

Do this in order and tick each step. Copilot waits.

- [ ] C0. Check your employment terms on outside projects and IP before making repos public. Use only synthetic data.
- [ ] C1. AWS: root MFA, then a budget alert, then pick one region.
- [ ] C2. IAM user/role with Ellie's policy, then `aws configure` (or SSO), then `npm run aws:check` (identity only).
- [ ] C3. Bedrock model access granted, then `npm run aws:check -- --only=bedrock` passes.
- [ ] C4. DynamoDB tables created and seeded, then `--only=dynamodb` passes.
- [ ] C5. Scheduler group and role, then `--only=scheduler` passes (creates and deletes a test schedule).
- [ ] C6. SNS: verify your number or e-mail, then `--only=sns` sends one test message that you **actually receive**.
- [ ] C7. `cloudflared tunnel --url http://127.0.0.1:8787`, set the public base URL, then open a phone link on your **real phone** over mobile data.
- [ ] C8. `npm run keys:check` and `npm run preflight` are both green.
- [ ] C9. Pack decisions (C1 from Module 10): fill in `verify / keep-default / remove` for all 59 rows. **Emergency numbers and anything shown in the demo must be `verify` with an official source URL, or `remove`.**
- [ ] C10. Install Chromium (`npx playwright install chromium`) and Docker Desktop (optional; if skipped, tell Copilot to mark Docker "untested" in the README).
- [ ] C11. Alexa+: attempt the official onboarding only if you have access. If not, note it in the friction log; the simulator is the demo path.

Tell Copilot: **"Keys are in. Start Phase D."**

---

## Phase D — Live verification (Copilot)

Run everything again with live services switched on:

```bash
npm run keys:check
npm run aws:check
npm run preflight
npm run apply:pack-decisions        # the Module 10 script that applies my choices
npm run validate:packs              # report the new unverified count
npm test
npm run demo:check -- --live        # all 15 steps against real Bedrock, DynamoDB, Scheduler, SNS
npm run bench -- --live
npm run screenshots                 # 1440x900 simulator + phone page
docker compose up --build           # only if Docker is installed
```

Plus these **end-to-end proofs**, each saved as evidence in `docs/audit/live-evidence.md` (with timestamps and no secrets or phone numbers):

- [ ] Hero sentence: Bedrock routes both tools; the DynamoDB items are visible in the console.
- [ ] A real **EventBridge schedule** fires (set it 2 minutes ahead), and SNS delivers the reminder to your phone with an HTTPS phone link that opens.
- [ ] Phone page "Fixed it" writes back to **DynamoDB**, and the next diagnosis uses it (the learning loop).
- [ ] Privacy: "forget the inverter" deletes the live DynamoDB items **and** the pending schedule.
- [ ] Kill switch: remove the Bedrock key mid-run and the demo still answers deterministically.
- [ ] MCP Inspector connected to the **public tunnel URL**.

### 🛑 STOP GATE D

Show me pass/fail per item, live p95 per tool, and the new unverified-pack count. Commit: `chore: live verification evidence`, then docs commit for `modules.md`.

---

## Phase E — Judging scorecard and feature decision

### E1. Write `docs/JUDGING_SCORECARD.md`

For each criterion in §0, write:

| Criterion | What judges look for | Ellie's evidence (file, video timestamp, test) | Honest score 1–5 | Biggest gap | Fix and effort (hours) |
|---|---|---|---|---|---|

Rules:

- Score from the **evidence**, not from intentions. If it is not visible in the repo, the video or the Devpost text, it scores as missing.
- Also score: Stage 1 pass/fail items, the AWS Builder mini challenge (is AWS use meaningful and documented, more than a single Bedrock call?), the Open Source mini challenge, product feedback quality, and the friction log.
- End with the **top 5 point-gainers ranked by score gain ÷ hours**.

### E2. Candidate features, ranked (implement only what I approve)

Check each against the code first. If it already exists, mark it **done** and skip it.

| Rank | Candidate | Why it could earn points | Criterion | Max effort |
|---|---|---|---|---|
| 1 | **Live AWS path proven end to end** (Phase D) | Turns "built for AWS" into "runs on AWS" | Tech, AWS Builder | already in plan |
| 2 | **Proactive day-30 reminder loop** (EventBridge → SNS → phone → one-tap booking → "Alexa, gas is booked") | It is in the video script (2:15–2:35) and shows Ellie acting **before** you ask | Quality of idea, Design | 3 h |
| 3 | **Late-delivery check-back** after "gas is booked" | A small, visible follow-through from the concept's Journey 3 | Design | 2 h |
| 4 | **Consequence-aware reminders** (bill due dates and late fees) | Stretch ability from the concept; makes the "cost of forgetting" concrete | Impact | 4 h |
| 5 | **Household members and job sharing** ("who usually handles this?") | Stretch ability; multi-user story | Impact, Idea | 6 h, **recommend skipping** |
| 6 | **Architecture and MCP Inspector clip** for the video (2:35) | Judges and AI review need to *see* the real MCP server | Tech | 1 h |
| 7 | **Product feedback depth**: per tool (MCP SDK, MCP Inspector, Amazon Devices Builder Tools, Bedrock, DynamoDB, EventBridge Scheduler, SNS, Alexa+ docs), covering what you used it for, what worked, what needs work, zero-to-hello-world time, and whether you would use it again | Required in every submission and goes straight to the product teams | All | 2 h |

Rules for any approved feature:

- It must have tests, must not break `demo:check`, must work in mock mode, and must have a live path.
- **Feature freeze: Tue 20 Oct, 23:59 IST.** After that, fixes only.

### 🛑 STOP GATE E

Show me the scorecard and the ranked list. I will reply with the feature numbers to build. One commit per feature: `feat(<area>): <feature>`.

---

## Phase F — Approved features (only those I list)

For each approved feature:

1. Write a mini-prompt in `docs/prompts/module-11-<feature>.md` with a Definition of Done.
2. Implement it, with tests in mock mode and the live path checked with `--live`.
3. Add one step to `demo:check` and the presenter script if it appears in the video.
4. Run the full gate (A2). Update the counts in `modules.md` (separate docs commit).

---

## Phase G — Submission hardening (Wed 21 – Thu 22 Oct)

Copilot drafts, I review and submit.

- [ ] **README**: 30-second pitch, architecture diagram, "Run in 3 commands", mock vs live table, judge quick-start (simulator URL, MCP Inspector command), honest limitations (Alexa+ US-only, Docker status, unverified pack count).
- [ ] **`SUBMISSION.md` → Devpost text**: problem, solution, how it works, the AWS services used and **how each one is used** (AWS Builder), what's next, and no placeholders left.
- [ ] **Product feedback** (E2 #7), specific and named, with the OAuth 401 finding if B4 found a conflict.
- [ ] **Friction log summary**: top 10 entries with severity, workaround and suggestion.
- [ ] **Video script check**: under 3:00, English, no third-party music or footage, and every claim in the video is backed by evidence in `live-evidence.md`.
- [ ] **`home-event-schema`** pushed public with MIT licence in About, CI green, `CONTRIBUTING.md`, and a contribution URL ready for the form.
- [ ] Main repo public (or private with the reviewer invites listed in `SUBMISSION.md`; invitations expire after 7 days, so send them at submission time).
- [ ] Final gate (A2) green, then **[YOU]** confirm the checklist, then Copilot creates the `v1.0.0` tag.
- [ ] `docs/TEARDOWN.md`: run after **20 Nov 2026** (the end of judging), not before.

---

## Timeline

| When (IST) | Phase |
|---|---|
| Sat 17 Oct, evening | A (audit) |
| Sun 18 Oct | B (inventory, guide, checks), then C (your key entry) |
| Mon 19 Oct, day | D (live verification), E (scorecard) |
| **Mon 19 Oct, 21:30** | **Office hours #2**: bring the B4 conformance gaps and the OAuth 401 question |
| Tue 20 Oct | F (approved features). **Feature freeze 23:59** |
| Wed 21 Oct | G (docs, repos), 3 rehearsals, screenshots |
| Thu 22 Oct | Record and upload video; **submit by 21:00** |
| Fri 23 Oct | Buffer only. Hard deadline Sat 24 Oct, 00:30 IST |

## Definition of Done for Module 11

- [ ] `final-audit.md` has no ❌ items; every ⚠️ item is fixed or explicitly accepted by me.
- [ ] `API_SETUP.md` is complete; `keys:check`, `aws:check`, `preflight` are green with live keys.
- [ ] Alexa+ conformance table complete, with any conflicts documented.
- [ ] `demo:check --live` passes; live p95 is recorded and within budget (or a fix is in place).
- [ ] Live evidence file complete for the 6 end-to-end proofs.
- [ ] Unverified pack count reduced by my decisions; nothing shown in the demo is unverified.
- [ ] Scorecard written; only approved features built; feature freeze respected.
- [ ] Submission package complete; `v1.0.0` tagged only after my confirmation.
- [ ] No amended commits; no secrets in history (`git log -p | grep -E "AKIA|aws_secret"` is empty).
