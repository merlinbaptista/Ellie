# Winner benchmarking

Purpose: find what has actually won Amazon voice and AWS agent competitions, measure Ellie against it, and convert the gaps into work that fits before the feature freeze.

## 0. Source verification, honestly

Every URL below was opened during this analysis. Three could not be read from this machine, and nothing from them is asserted as fact.

| Source | Opened | Status |
|---|---|---|
| [Hackathon overview, requirements, prizes, judging criteria](https://amazonappdev2026.devpost.com/) | yes | **Read in full.** Every claim about this hackathon below comes from here |
| [Smart Elephant on Devpost](https://devpost.com/software/don-t-forget) | yes | **Read in full.** Story, architecture and challenges quoted below are from this page |
| [Alexa+ MCP QuickStart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html) | yes | **Read in full** (see the conformance table in [DEPLOY.md](DEPLOY.md)) |
| [Alexa+ MCP Toolkit Overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html) | yes | **Read in full** |
| [AWS AI Agent Global Hackathon winners](https://aws-agent-hackathon.devpost.com/updates/38140-congratulations-to-the-winners-of-the-aws-ai-agent-global-hackathon) | yes | **Read in full.** 1st/2nd/3rd place citations below are verbatim from this page |
| [Alexa Skills Challenge 2017 winners announcement](https://developer.amazon.com/en-US/blogs/alexa/post/b5848016-aa2c-42fa-8365-903dfaaea522/announcing-the-winners-of-the-amazon-alexa-skills-challeng) | yes | ❌ **HTTP 429.** Not read. Smart Elephant's Grand Prize is instead evidenced by its own Devpost page, which shows "WINNER Grand Prize Award" and "WINNER Finalist Award" |
| [Voicebot: multimodal sweep](https://voicebot.ai/2017/07/03/multi-model-sweep-amazon-alexa-skill-contest-smart-elephant-wins/) | yes | ❌ **Blocked by a corporate proxy.** The "all three top prizes were multimodal" claim is **not** asserted anywhere in this document |
| Loop It!, Chop Chop, Home Connect My Oven Assistant announcements | yes | ❌ **HTTP 429** on the developer.amazon.com blog host. Treated as unverified; used only as hypotheses, clearly labelled |
| [TWIZ / TaskBot Challenge](https://www.amazon.science/alexa-prize/taskbot-challenge/2022) | yes | ❌ Not retrieved this session. Treated as unverified |

**Rule applied throughout:** where a source could not be read, the corresponding row is marked *(unverified)* and carries no number or quotation.

## 1. Official criteria this is measured against

From the hackathon page, the four judging criteria are:

1. **Tech Implementation** — how well is it built, and how effectively does it use the required tech?
2. **Design** — a complete, coherent product experience with an intuitive interaction model for the target device.
3. **Potential Impact** — a credible, specific case for solving customer needs, realistically serving an audience beyond the hackathon.
4. **Quality of the Idea** — creative, imaginative use of the tools, with genuine understanding of the ecosystem and end-user needs.

Also from that page, and directly relevant to Ellie:

- The Alexa+ track explicitly permits **"a simulated Alexa+ experience in a web app"** for those new to MCP, and requires the repository to include the simulation's source. Ellie does **both**: a real self-hosted MCP server *and* a simulator.
- The repository must **actually call the track technology in code** — "an import, an entry point, a loaded agent/flow/MCP config, not just a mention in the README."
- Demo video **under 3 minutes**, and "judges aren't required to watch past the 3-minute mark."
- **Product feedback on every tool/API/SDK used** is required.
- **Friction logs can earn up to a 10% judging bonus.**
- Two mini challenges are open to the same project: **AWS Builder** (documented AWS integrations) and **Open Source** (a new OSS project with a licence, shipped during the window).
- Deadline: **24 Oct 2026, 12:30 am IST**. 56,750 participants.

## 2. Patterns in what wins

Eight recurring traits, each tied to the sources that actually support it.

| # | Pattern | Evidence |
|---|---|---|
| P1 | **A first-person origin story beats a market statistic.** Smart Elephant opens with kids asking for a permission slip "while I'm washing dishes… or walking in the door with a handful of groceries" — a specific, physically-constrained moment | [Devpost](https://devpost.com/software/don-t-forget) |
| P2 | **Name what the platform already does, then show the precise gap.** Smart Elephant's story walks through Alexa's native to-do list (no date/time, you must remember to check it) and calendar events (works, but clutters the calendar) before introducing the skill | [Devpost](https://devpost.com/software/don-t-forget) |
| P3 | **Voice in, a second surface out.** Smart Elephant's entire value is "say it to Alexa, receive an SMS on your phone at the right time" | [Devpost](https://devpost.com/software/don-t-forget) |
| P4 | **Show the architecture, and be honest about what was hard.** Smart Elephant includes architecture diagrams and names its real difficulties: converting relative spoken time to absolute UTC, accepting arbitrary reminder text, firing at any minute, and DynamoDB read/write cost | [Devpost](https://devpost.com/software/don-t-forget) |
| P5 | **A specific local problem with real numbers.** EcoLafaek won 1st place addressing "over 100 tons of daily uncollected waste in Dili", Timor-Leste | [Winners page](https://aws-agent-hackathon.devpost.com/updates/38140-congratulations-to-the-winners-of-the-aws-ai-agent-global-hackathon) |
| P6 | **A full stack across several surfaces, not one screen.** EcoLafaek shipped a citizen mobile reporting app plus authority-facing insights | Same |
| P7 | **An agent that autonomously chains tools on Bedrock.** EcoLafaek's agent "autonomously chain[s] tools" on Nova-Pro with AgentCore; Province uses "a sophisticated multi-agent architecture" on Bedrock | Same |
| P8 | **Explainability and a verified knowledge base, with a measured number.** AegisAgent delivers "a transparent, defensible coverage decision workflow"; Province pairs "intelligent document processing with a verified IRS knowledge base" and reports "100% accuracy on Form 1040" | Same |

Two further hypotheses, from winners whose announcements could not be read (**unverified** — do not cite in the submission):

- *(unverified)* Loop It!, Multimodal 2019: visuals should complement voice, be glanceable, and simplify navigation rather than replace speech.
- *(unverified)* TWIZ, TaskBot Challenge: one question at a time plus a step card is the proven shape for guided multi-step fixes.

Both happen to describe what Ellie already does, which is exactly why they must not be used as evidence.

## 3. Ellie versus the winner patterns

| Pattern | Ellie today (evidence) | Gap | Fix | Effort | Criterion |
|---|---|---|---|---|---|| P1 Personal origin story | README and `SUBMISSION.md` open with a product abstraction: "Household maintenance is fragmented across memory, receipts…" | No human moment. The strongest story the winner told is the one Ellie doesn't tell | Open with one true household moment, in first person, with no invented statistic | 20 min, docs only | Impact, Idea |
| P2 "What Alexa+ already does → what it can't → Ellie" | Implied in "What Is Different", never stated as a contrast | The judges are the Alexa+ team; they need the gap named explicitly | Three-line framing in README, `SUBMISSION.md` and the video open | 20 min, docs only | Idea, Impact |
| P3 Voice in, second surface out | Fully built: `send_to_phone`, signed links, consent, GSM-7 ≤160 chars, phone page; `journey3.phone.integration.test.ts` | Not yet *shown* with voice, card and phone in one frame | Video direction: one shot, three surfaces | 0 code | Design |
| P4 Architecture + honest challenges | `docs/friction-log.md` is extensive and specific; architecture is in the README | Friction log is worth up to 10% and is currently buried in `docs/` | Link it from the README and name it in the submission | 10 min | Tech |
| P5 Specific local problem with numbers | Region packs carry the India LPG rules; Bengaluru is the demo household | The specific local rule is in data, not in the pitch | Lead with the Bengaluru specifics the packs already encode, cited to the pack `source`, never invented | 20 min | Impact |
| P6 Multi-surface full stack | Five surfaces exist: Echo Show card, phone page, simulator, MCP App view, privacy views | Under-claimed; the submission mentions tools, not surfaces | Name all five in README and `SUBMISSION.md` | 15 min | Design |
| P7 Agent chaining tools on Bedrock | Two tools in one utterance via the simulator orchestrator over a **real MCP client loopback**; `sim.combine.test.ts`, `sim.split.test.ts`; Bedrock tool-use router with validation and fallback | Buried. This is the single most winner-shaped thing Ellie does | Make the hero sentence a two-tool utterance and say so | 15 min | Tech, Idea |
| P8 Explainability + verified KB + a number | Diagnosis cites evidence IDs; the LLM may only rank supplied causes and is rejected for invented causes or uncited numbers (`diagnosis.llm.test.ts`). 239 tests; mock p95 under 500 ms | **59 pack values are still unverified.** Province's win was partly *verified* knowledge | Show the citations and the test count on screen; be explicit that packs are sourced starter data pending review | 👤 user decision | Tech, Impact |

## 4. Showcase checklist

For the video, README and Devpost. Each line maps to a pattern above.

- [ ] **First 20 seconds: a real household moment**, first person, honestly framed, **no invented statistics**. (P1) 👤 *you must supply the sentence*
- [ ] **"What Alexa+ already does → what it can't → Ellie."** Alexa+ can set a reminder; it cannot learn that *your* cylinder lasts 27 days, apply your region's booking rules, or diagnose from your own repair history. (P2)
- [ ] **Hero sentence covers two tools in one utterance**, with **voice, Echo Show card and phone visible together in one frame**. (P3, P7)
- [ ] **The learning loop, before and after on screen**: the prediction before the new event, then after. (P8)
- [ ] **Texas switch in 15 seconds** — same code, different region pack, different vocabulary and rules. (P5, P6)
- [ ] **Safety refusal shown live**: gas smell → no DIY steps, switch off, call a professional, the region emergency number. Say on screen that the number is a pack value. (P8)
- [ ] **Proof it is real**: MCP Inspector listing the tools, the test count, `npm run demo:check` green, and — if keys exist — the AWS console showing DynamoDB items and the schedule. (P4, P7) 🔑 *AWS console shot needs credentials*
- [ ] **Name the friction log out loud** and link it. Up to 10% of the score. (P4)
- [ ] **Devpost story uses the Smart Elephant headings**: Inspiration / What it does / How I built it / Challenges / Accomplishments / What I learned / What's next. (P1, P4)
- [ ] **Declare both mini challenges**: AWS Builder (Bedrock, DynamoDB, SNS, EventBridge Scheduler, SQS, with documented integrations) and Open Source (`home-event-schema`, MIT). 👤 *schema repo must be published*
- [ ] **State the simulator is a simulator**, every time it appears, and say why (the MCP Toolkit is US-only and partner-gated).

## 5. Competitive check

The gallery has 56,750 participants and is not fully readable from here; project pages load individually but cannot be enumerated or searched exhaustively. **No competitor claim is made in this document.**

What was visible: the hackathon overview, requirements, prizes, judges and criteria. The gallery listing itself was not traversed.

### Ten-minute manual check before you submit

1. Open the [project gallery](https://amazonappdev2026.devpost.com/) and filter to the **Alexa+** track.
2. Sort by most recent, then by most liked. Skim titles only on the first three pages.
3. Search the gallery for: `home`, `house`, `household`, `maintenance`, `reminder`, `appliance`, `chores`, `memory`, `repair`, `service`. Two minutes total.
4. For each look-alike, note three things only: does it **learn from history**, does it have **region rules**, does it **diagnose**?
5. If one matches on all three, sharpen Ellie's opening line to lead with whichever of the five surfaces it lacks. Do **not** change the product.
6. Check whether any entry is also doing a *simulated* Alexa+ experience plus a real MCP server. If several are, make the MCP Inspector shot earlier in the video.
7. Note anything that looks like a prior-art collision and record it in `SUBMISSION.md` under "If your project existed before the hackathon".

## 6. Verdict

Scores are 1–5 against the four official criteria, judged on evidence in this repository today.

| Criterion | Score | Evidence for the score | What is holding it back |
|---|---|---|---|
| **Tech Implementation** | **5** | Real MCP server, spec 2025-11-25, Streamable HTTP, 16 tools, MCP Apps on 5 of them, OAuth 2.1 resource protection, four AWS adapters each with a working mock, 239 tests, mock p95 under 500 ms, Inspector evidence, a conformance table against the official Alexa+ requirements, and a documented deviation (`ALEXA_MODE`) | Nothing material. Live AWS is credential-blocked, and that is disclosed |
| **Design** | **4** | Five coherent surfaces; one question per turn; ≤2-sentence speech; safety views that show only a banner and a call button; axe-clean phone views; 54.97 KB gzip phone bundle | Cards have not been audited one-by-one against "one fact, one action". The judges will see them before they read anything |
| **Potential Impact** | **3** | Two real regions with different rules; consent, export and erase; an extractable open schema | The pitch is abstract, the Bengaluru specifics are buried in pack data, and **59 pack values remain unverified** — the weakest point in the whole submission |
| **Quality of the Idea** | **4** | "Normal reminders remember a time. Ellie remembers your home." The learning loop, region packs and cited diagnosis are genuinely distinctive | The lineage to the 2017 Grand Prize winner — and what Ellie does that it could not — is never stated |

**Overall: 4.0 / 5.** The build is ahead of the story. Every remaining point is in narrative and verification, not in code.

### Top 5 changes, ranked by score gain ÷ hours

All five are documentation or user decisions. **None is a feature.** All fit before the freeze on Tue 20 Oct, 23:59 IST.

| # | Change | Est. gain | Hours | Ratio | Owner |
|---|---|---|---|---|---|
| 1 | Rewrite the README and `SUBMISSION.md` openings: real household moment, then "what Alexa+ already does → what it can't → Ellie", then the Bengaluru specifics from the packs | +0.5 Impact, +0.5 Idea | 0.5 | **2.0** | me, with 👤 one sentence from you |
| 2 | Rewrite `VIDEO_SCRIPT.md` to the showcase checklist: two-tool hero sentence with voice + card + phone in one frame; before/after learning loop; Texas in 15 s; live safety refusal; Inspector and test count as proof | +0.5 Design, +0.3 Tech | 0.5 | **1.6** | me |
| 3 | Verify or remove the pack values the demo actually speaks, and the emergency numbers | +0.5 Impact | 1.0 | **0.5** | 👤 **you only** — the agent must never mark a pack fact verified |
| 4 | Audit every card against "one fact, one action" and fix any that fail | +0.3 Design | 1.0 | 0.3 | me |
| 5 | Publish `home-event-schema` and complete the submission URLs, declaring both mini challenges | +0.3 Impact | 1.0 | 0.3 | 👤 **you only** — needs an IP check and a GitHub account |

Items 1, 2 and 4 are the cheap wins and are applied in this module without changing any behaviour. Items 3 and 5 stay with you.

### What is explicitly *not* recommended

- **No new tools.** Sixteen is already more than a three-minute video can show.
- **No live AWS scramble.** The mock path is fast, reproducible and honestly labelled; a half-provisioned AWS account the night before is a worse demo and a worse risk.
- **No chasing an Alexa+ device demo.** The Toolkit is US-only and partner-gated. Building the simulator was the correct call and the rules explicitly permit it.
