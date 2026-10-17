# Ellie: Module 12, Winner Benchmarking, Gate A Fixes and API-Ready Freeze

> **Paste this whole file into GitHub Copilot (agent mode) in the Ellie workspace.**
> First commit: save it as `docs/prompts/module-12.md` (`docs: add Module 12 prompt`).
> This module finishes everything **except entering API keys**. When that is true, and only then, your final message is the single word **`Done`** (see §7).

---

## 0. Where we are (read carefully)

Module 11 is **not finished**. It stopped correctly at **Gate A** (`bbe6754` audit, `2d653ee` roadmap). Phase B (API inventory, `API_SETUP.md`, `keys:check`, Alexa+ conformance) was never started. The audit found:

| Gate A finding | Evidence |
|---|---|
| Full test run **216 / 217**: privacy Journey 6 fails in the full run and passes alone | Test-isolation / shared-state bug |
| `npm run smoke` fails: its fixed household hits send de-duplication | Repeatability bug |
| Dev-clock speech over-redacted (dates or counts masked) | Redaction too broad |
| Module 9 original prompt missing | Docs gap |
| MCP Inspector UI not exercised | Unrun check |
| Docker not built | Docker not installed |
| Screenshots not generated | Chromium not installed |
| Advisories: standalone 7 (dev toolchain), monorepo 10 | Not triaged |
| `preflight` reports missing production config | Expected until keys exist |
| 59 unverified pack values | Needs my decisions (stays user-owned) |

**I approve all 11 proposed fixes from Gate A**, with the decisions in Phase 1 below.

### Ground rules (unchanged)

1. No `--amend` and no force push. One commit per fix; roadmap and docs updates go in separate commits.
2. Staged secret/PII scan before **every** commit (the scan you used in Module 11).
3. Fix the **proven cause**. Never weaken a test, skip it, add retries, or loosen production behaviour (dedupe, redaction, consent) to make a test pass.
4. Never mark a region-pack fact verified. Never invent Alexa+ setup steps; use only the official docs.
5. Report "not run" honestly. Log every snag in `docs/friction-log.md` (worth up to 10%).

---

## Phase 1: Close Gate A (fixes)

| # | Fix | Definition of done |
|---|---|---|
| 1.1 | **Privacy Journey 6 flake** | Reproduce with the full suite, `--sequence.shuffle`, and the seed that fails. Find the shared state (store singleton, fake clock, dedupe cache, env var, port). Fix the isolation in test setup **or** the real bug if production code leaks state. Add a regression test. **The full suite passes 3 times in a row**, plus once shuffled. |
| 1.2 | **Smoke repeatability** | Smoke uses a unique, disposable household (e.g. `smoke-<timestamp>`) and cleans up after itself. Production dedupe stays unchanged. `npm run smoke` passes **twice in a row** against the same running server. |
| 1.3 | **Over-redaction** | Phone numbers, e-mails and tokens are still masked; dates, day counts and quantities in speech are not. Add tests for both directions. The privacy audit test stays green. |
| 1.4 | **Module 9 prompt** | Rebuild `docs/prompts/module-9.md` from the commit history, `modules.md` and the code. Label it "reconstructed" and record the reason. |
| 1.5 | **Demo anchor in README** | State the fake clock (`ELLIE_FAKE_NOW=2026-10-16T09:00:00+05:30`), the seed command and the reset command so a judge reproduces the demo exactly. |
| 1.6 | **Advisories** | Table: package, severity, runtime or dev-only, path, fix available, decision. Apply only **non-breaking** upgrades that keep every test green. No `--force`. Document the rest as accepted with reasons. |
| 1.7 | **Earlier prompts and coverage** | Recover any full Module 1–6 prompts from git history if they exist; otherwise note it. Rerun schema coverage and record the percentage. |
| 1.8 | **MCP Inspector** | Run `npx @modelcontextprotocol/inspector` (CLI mode is fine) against `http://127.0.0.1:8787/mcp`: list tools, call each tool once, and save the redacted output to `docs/audit/inspector-evidence.md`. |
| 1.9 | **Docker** | If Docker is installed, build and run it, then smoke it. If not, **accept it as untested**: README says "Docker files provided, not tested on this machine." Never claim it works. |
| 1.10 | **Screenshots** | Try `npx playwright install chromium`, then `npm run screenshots` (1440×900 simulator plus the phone page). If the install is blocked, mark it 👤 in the audit with the exact command for me. |
| 1.11 | **Preflight** | Split the output into **CODE** problems (must be zero) and **CREDENTIAL** gaps (allowed: missing AWS keys, region, model ID, public URL, SNS destination). |

Commit each fix separately (`fix: …`, `test: …`, `docs: …`). Then update `final-audit.md` and `modules.md` in a docs commit.

---

## Phase 2: Make the repo API-ready (Module 11 Phase B, without keys)

Do everything from Module 11 Phase B **except entering real values**:

- **B1. Inventory** every `process.env` and config key, mapped against `.env.example`. Fix missing or unused entries.
- **B2. Write `docs/API_SETUP.md`**: one section per service, in this order:
  - AWS account safety: MFA and a budget alert
  - IAM (least privilege)
  - Bedrock (model access, region)
  - DynamoDB (create and seed)
  - EventBridge Scheduler (group and execution role)
  - SNS: check the **current official docs** for the SMS sandbox, verified numbers, spend limits and India sender rules; e-mail is the fallback
  - Cloudflare Tunnel (`cloudflared`) or ngrok, with the public base URL
  - OAuth (optional)
  - Alexa+
  - GitHub

  For each: what it's for, cost (link the official pricing; never invent prices), console steps with links to the official docs, the exact `.env` variable names, the verify command and its expected output, the fallback, and teardown after **20 Nov 2026**.
- **B3. Verification scripts**:
  - `npm run keys:check` reports each service as CONFIGURED, MISSING or MALFORMED. It never prints secrets; values are masked as the first 4 characters plus `…`.
  - `npm run aws:check -- --only=<service>` returns PASS, FAIL or SKIPPED, with the likely cause and fix printed for each failure.
  - Add mocked unit tests for both.
- **B4. Alexa+ conformance table** in `docs/DEPLOY.md`, built only from:
  - https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html
  - https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html

  Check Ellie against each of these:
  - **Unauthenticated requests:** the QuickStart says to return 401 **without** a `WWW-Authenticate` header. If Module 9 sends one, add an `ALEXA_MODE` switch that defaults to the Alexa+ behaviour, test both behaviours, and log the difference in the friction log and product feedback.
  - **Discovery metadata:** the RFC 9728 Protected Resource Metadata document, and `/.well-known/oauth-authorization-server` with `S256` in `code_challenge_methods_supported`.
  - **Authorization:** PKCE, plus the `resource` parameter and `scopes_supported`.
  - **Transport and visuals:** Streamable HTTP, the MCP Apps standard, a remote URL, and the performance target.

  Also note that the Toolkit is US-only, and that it's limited to select partners (as a participant's question on the hackathon forum points out). The simulator is the demo path.
- **B5. Bedrock timeout fallback.** Add a configurable timeout. When it's hit, the deterministic answer is used and logged. Test it with a mocked slow client. Prepare `npm run bench -- --live` (it runs once keys exist).

---

## Phase 3: Benchmark against past Amazon winners → `docs/WINNERS_ANALYSIS.md`

Use the research below. **Open each URL to confirm the details before you write them down**, cite every claim, and don't add winners or numbers that you can't verify.

### 3.1 Reference winners and what they showed

| Winner | Event | What won it | How it was shown | Lesson for Ellie |
|---|---|---|---|---|
| **Smart Elephant** (Darian Johnson), Grand Prize | Alexa Skills Challenge 2017 ([blog](https://developer.amazon.com/en-US/blogs/alexa/post/b5848016-aa2c-42fa-8365-903dfaaea522/announcing-the-winners-of-the-amazon-alexa-skills-challeng), [Devpost](https://devpost.com/software/don-t-forget)) | Say a reminder by voice; get it as a **text on your phone** at the right time | A personal origin story (kids asking while hands were busy with dishes and groceries); an explanation of why native Alexa features fell short; an architecture image; honest challenges (time zones, cost) | Ellie is the 2026 successor to this exact winner. Name that lineage, then show what Smart Elephant could not do: **learning from history, region rules, diagnosis** |
| **All 3 top prizes were multimodal** | Same challenge ([Voicebot](https://voicebot.ai/2017/07/03/multi-model-sweep-amazon-alexa-skill-contest-smart-elephant-wins/)) | Voice in, another surface out | — | Show voice, the Echo Show card **and** the phone together |
| **Loop It!**, Grand Prize | Multimodal 2019 ([blog](https://developer.amazon.com/en-US/blogs/alexa/post/26aa26b3-f449-495e-b78f-d1e6e55d64fe/announcing-the-winners-of-the-alexa-skills-challenge-multimoda)) | Voice-first, with visuals as "icing" | The finalist criteria: adapt to the device, glanceable complementary info, simplify navigation ([finalists](https://developer.amazon.com/blogs/alexa/post/781e9ebd-9d0b-426b-a3ce-539a28fe397d/announcing-the-finalists-for-the-alexa-skills-challenge-multimodal)) | The card must be **glanceable**: one fact, one action. Audit every card against this |
| **Chop Chop**, Best Echo Show skill | Life Hacks 2018 ([blog](https://developer.amazon.com/en-US/blogs/alexa/post/2a12e429-8091-4000-a435-ba5c5ff16b85/announcing-the-life-hacks-challenge-winner)) | Hands-free kitchen help | Judged on creativity, voice-first UX, impact and **habitual use** | Prove that Ellie gets used **every week** (due-this-week card, day-30 reminder) |
| **Home Connect My Oven Assistant**, Best Food & Drink | Beyond Voice 2021 ([blog](https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2021/01/announcing-the-alexa-skills-challenge--beyond-voice-winners-)) | Appliance-aware advice | — | Appliance knowledge wins; Ellie's history and warranty awareness fits |
| **TWIZ**, TaskBot 2 winner | Alexa Prize ([Amazon Science](https://www.amazon.science/alexa-prize/taskbot-challenge/2022)) | Multi-step task guidance, voice plus visuals on Echo Show, an LLM driving the dialogue | Research-grade evaluation | One question at a time, plus a step card, is the proven pattern for guided fixes |
| **EcoLafaek**, 1st place | AWS AI Agent Global Hackathon 2025 ([winners](https://aws-agent-hackathon.devpost.com/updates/38140-congratulations-to-the-winners-of-the-aws-ai-agent-global-hackathon)) | A specific **local problem with real numbers**, a full stack (citizen app, staff app, dashboard), and an agent chaining tools on Bedrock | Concrete local stakes; a multi-surface product; deep AWS use | Open with **Bengaluru specifics** (the 25-day LPG rule) and a real household moment; show several surfaces |
| **AegisAgent / Province**, 2nd and 3rd | Same | Explainable decisions; a verified knowledge base; measured accuracy | — | Show **cited causes** and a **test count or accuracy number** on screen |

### 3.2 What to write

1. **Patterns**: 6–8 recurring winner traits, each with its sources.
2. **Ellie vs winners matrix**: rows are the traits; columns are *Ellie today (evidence)*, *Gap*, *Fix*, *Effort*, *Criterion affected*.
3. **Showcase checklist** for the video, README and Devpost, derived from the patterns. At minimum:
   - The first 20 seconds show a **real household moment**: your own, honestly framed, with no invented statistics.
   - "What Alexa+ already does → what it can't → Ellie" (the Smart Elephant framing).
   - The hero sentence covers two tools in one utterance, with **voice, card and phone visible together**.
   - The learning loop, shown as **before and after on screen**.
   - A Texas switch in 15 seconds (global proof).
   - The safety refusal (gas → 1906), shown live.
   - Proof that it's real: the MCP Inspector listing tools, test count, `demo:check` green, and the AWS console with DynamoDB items and the schedule.
   - The Devpost story uses the Smart Elephant headings: Inspiration, What it does, How I built it, Challenges, Accomplishments, What I learned, What's next.
4. **Competitive check**: you can't fully read the current gallery (56k+ participants). List what you could see, and give me a 10-minute manual checklist for browsing the [project gallery](https://amazonappdev2026.devpost.com/) for look-alike "home memory / reminder / appliance" entries before I submit.
5. **Verdict**: a score of 1–5 for each judging criterion, with the evidence for each, and the **top 5 changes ranked by score gain ÷ hours**. Only recommend features that fit before the **feature freeze on Tue 20 Oct, 23:59 IST**.

### 3.3 Apply the cheap wins now (no new features)

Update `README.md`, `docs/SUBMISSION.md`, `docs/VIDEO_SCRIPT.md` and the presenter script to follow the showcase checklist. Keep every claim backed by evidence. Leave placeholders only for things I must supply (personal story line, video URL, repo URLs).

### 🛑 STOP GATE 3

Show me the matrix, the verdict and the top 5 list. Wait for me to approve any feature work. If I approve none, go straight to §7.

---

## Phase 4: Approved features only (if any)

Follow the Module 11 Phase F rules: each feature gets a mini-prompt, tests, a mock path and a live path, a `demo:check` step, its own commit, and the full gate. Stop at the freeze.

---

## 7. Final gate and the word "Done"

Run on a clean tree:

```bash
git status --short                      # empty
npm ci && npm run build && npm run typecheck && npm run lint
npm test                                # run 3 times; all green each time, plus once shuffled
npm run validate:packs                  # unverified count allowed; no schema errors
npm run demo:check                      # 15/15 (or more if features were added)
npm run bench                           # every tool p95 < 500 ms (mock)
npm run smoke                           # twice in a row, against one server
npm run keys:check                      # every service MISSING or CONFIGURED; zero MALFORMED; no code errors
npm run preflight                       # zero CODE problems; only CREDENTIAL gaps remain
```

Also confirm that:

- the Gate A register has no ❌ and no ⚠️; every remaining item is 🔑 (credential) or 👤 (user-owned)
- `API_SETUP.md`, the B4 conformance table and `WINNERS_ANALYSIS.md` are committed
- `modules.md` has the hashes and test totals
- `git log` shows no amended commits, and the history contains no secrets

**If and only if every item above is true**, write a short evidence block (counts, hashes, the remaining 🔑 and 👤 list), then end your response with exactly this line:

```
Done
```

If **any** item fails, do **not** write "Done". List what failed, why, and the proposed fix, then stop.