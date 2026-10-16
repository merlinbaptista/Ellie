# Ellie — Module 8: Simulated Alexa+ Web App (voice, cards, multi-intent, household switcher)

> **How to use this file**
> 1. Module 7 must be committed (`7abecef`, 145 tests green).
> 2. Save this file as `docs/prompts/module-8.md`.
> 3. In **Copilot Chat → Agent mode** send:
>    `Implement everything in #file:docs/prompts/module-8.md exactly. Follow #file:.github/copilot-instructions.md. Do section 0 first and commit it separately, then work section by section, run the verification at the end, and fix any failures before stopping. Make new commits; do not amend.`
> 4. Run **Verification** yourself and tick the **Definition of Done**.

---

## 0. Module 7 review fixes (do these first, commit as `Module 7 follow-ups`)

Module 7 is accepted. Five small items came out of the review.

### 0.1 Commit hashes in docs
The Module 7 prompt header named the wrong hash for the Module 6 follow-ups. The correct history is:

| Commit | Contents |
|---|---|
| `2993d55` | Module 5 follow-ups |
| `afdcac6` | Module 6 |
| `2df8b37` | Module 6 follow-ups |
| `7abecef` | Module 7 |

Make `docs/modules.md` list these hashes in a "Commit history" table, adding a row for each module and follow-up from now on. Don't edit earlier prompt files beyond a one-line correction note at the top of `docs/prompts/module-7.md`.

### 0.2 No more amending
Module 7's final fixes were amended into the existing commit. From now on, every fix gets its own new commit; never use `git commit --amend` or rewrite history. Add this rule to `.github/copilot-instructions.md`.

### 0.3 Confirm Module 7 section 0 items
The Module 7 log doesn't show its own section 0 follow-ups. Under Module 7 in `docs/modules.md`, list where each one lives (file and test name):
- the explicit `ttlClock` field
- schema 1.4.1
- the phone smoke step
- the AC test names
- `npm run aws:check`

Add anything that is missing.

### 0.4 Automated accessibility instead of a manual Lighthouse run
Lighthouse wasn't run. Add `vitest-axe` (or `jest-axe` with Vitest) and assert **no axe violations** for:
- the phone page's Fix, Booking, Summary, Error and safety-only views
- the simulator's main screen (§6)

Keep the Lighthouse score as an optional manual step in the README.

### 0.5 MCP Apps host rendering
No external MCP Apps host was used to test the card view. This module's simulator includes a **"Host view" toggle** (§6.6) that loads the real `ui://ellie/card.html` resource in a sandboxed iframe and talks to it like an MCP Apps host does. That becomes the verification. Record the result in the friction log.

---

## 1. Goal of this module

Build a **web simulator of Alexa+ on an Echo Show** so the whole product can be demoed on a laptop with no Alexa+ access. It talks to Ellie over the **real MCP protocol** (Streamable HTTP), like Alexa+ would. After this module:

1. Click the mic (or type), say *"Alexa, the cylinder's changed and the purifier is beeping again"*. The simulator splits it into **two intents**, calls `log_event` and `diagnose`, speaks both answers aloud, and shows both cards.
2. Follow-up questions work by voice. *"Roughly when was the previous one changed?"* → *"about five weeks ago"* → saved.
3. *"Send it to my phone"*, *"it's fixed"* and *"yes"* resolve from conversation context.
4. A **phone panel** next to the Echo Show shows the outbox as text messages. Tapping a link opens the Module 7 phone page inside a phone frame.
5. A **household switcher** (Bengaluru, Texas, a fresh home) changes language, voice, time zone and suggested phrases.
6. **Demo controls**: time travel, reseed, latency timeline and a developer drawer with raw tool calls.
7. Routing uses **Bedrock tool use** when keys exist, and a **deterministic router** otherwise. Ellie's spoken words always come from Ellie's tool results, never from the router.
8. The server serves the simulator at `/sim/`, so the demo is still one process.

### Scope guard
| Build now | Do NOT build yet |
|---|---|
| §0 fixes, `packages/simulator`, server-side turn orchestrator (MCP client, mock + Bedrock routers, multi-intent, follow-up state), sim API, browser voice, Echo Show UI, phone panel, household switcher, dev controls, MCP Apps host view, tests | `what_do_you_know`, `forget_item`, consent records, OAuth (Module 9); scripted demo runner, pack verification, Docker, schema repo extraction (Module 10) |

---

## 2. Architecture

```text
Browser (packages/simulator, React)
  ├─ mic → Web Speech API (SpeechRecognition) → text
  ├─ POST /api/sim/turn { sessionId, householdId, text, lang }
  │      ↓
  │  Server: src/simulator/  (orchestrator)
  │    1. safety pre-check on the whole utterance
  │    2. pending follow-up? → fill retry args
  │    3. router (Bedrock tool-use | deterministic) → planned tool calls
  │    4. MCP Client ──Streamable HTTP──► /mcp (same process, real protocol)
  │    5. combine results → one turn reply
  │      ↓
  ├─ SpeechSynthesis speaks reply.speech (Ellie's words verbatim)
  ├─ Echo Show frame renders cards with @ellie/ui <Card>
  └─ Phone panel polls /api/outbox → opens /phone/?t=… in a phone frame
```

The orchestrator **must** call Ellie through an MCP `Client` + `StreamableHTTPClientTransport` pointed at the server's own `/mcp`. Don't call domain functions directly. This proves the protocol path the judges care about.

---

## 3. Files

```text
packages/schema/src/sim.ts             # NEW: SimTurnRequest/Response (1.6.0, excluded from OSS extraction in Module 10)
packages/server/src/simulator/
├─ mcpClient.ts                        # one MCP client session per sim session, reconnect on 404/400
├─ orchestrator.ts                     # runTurn()
├─ session.ts                          # SimSession state (context, pending follow-ups, history)
├─ split.ts                            # multi-intent splitting (uses @ellie/schema splitAndMatch)
├─ routers/
│  ├─ types.ts                         # Router interface, PlannedCall
│  ├─ deterministic.ts                 # rules table (§5.2)
│  └─ bedrock.ts                       # Converse tool use (§5.3)
├─ combine.ts                          # merge tool results into one reply
├─ wake.ts                             # strip "Alexa", "hey Alexa", fillers
└─ api.ts                              # /api/sim/* routes
packages/simulator/                    # NEW @ellie/simulator (Vite + React, dev port 5173)
├─ index.html  vite.config.ts (base "/sim/", proxy /api,/mcp,/phone,/l → 8787)
├─ src/
│  ├─ main.tsx  App.tsx
│  ├─ api.ts
│  ├─ voice/recognition.ts             # SpeechRecognition wrapper (+ webkit prefix)
│  ├─ voice/synthesis.ts               # SpeechSynthesis wrapper, voice by lang
│  ├─ echo/EchoShow.tsx                # 1024×600 device frame
│  ├─ echo/LightBar.tsx                # state colours
│  ├─ echo/CardStack.tsx               # one or more @ellie/ui Cards
│  ├─ echo/Caption.tsx
│  ├─ phone/PhoneFrame.tsx             # 390×844 frame
│  ├─ phone/Messages.tsx               # outbox as SMS bubbles
│  ├─ controls/HouseholdSwitcher.tsx
│  ├─ controls/TimeControls.tsx
│  ├─ controls/Suggestions.tsx         # tap-to-say chips per household
│  ├─ dev/Timeline.tsx                 # latency bars per turn
│  ├─ dev/DevDrawer.tsx                # raw calls + structuredContent
│  └─ host/McpAppHost.tsx              # §6.6 Host view toggle
└─ test/
```

Root scripts:
```json
"dev:sim": "npm run dev -w @ellie/simulator",
"dev:all": "concurrently -n server,phone,sim \"npm run dev\" \"npm run dev:phone\" \"npm run dev:sim\""
```
Build order: schema → ui → phone → mcp-app → simulator → server.

### 3.1 Environment (`.env.example` + Zod)
```dotenv
# ───────── Simulator (Module 8) ─────────
# Serve /sim and /api/sim. Default: true when NODE_ENV != production.
SIMULATOR_ENABLED=
# Required to use the simulator when NODE_ENV=production (sent as x-sim-access-code)
SIM_ACCESS_CODE=
# Router: auto | mock | llm  (auto = llm when the LLM driver is bedrock)
SIM_ROUTER=auto
SIM_ROUTER_TIMEOUT_MS=1500
SIM_MAX_TOOL_CALLS=4
```
In production, `/sim` and `/api/sim/*` are off unless `SIMULATOR_ENABLED=true` **and** `SIM_ACCESS_CODE` is at least 12 characters. Compare it with `timingSafeEqual`, and rate-limit to 30 turns a minute per IP.

---

## 4. Schema 1.6.0 (`sim.ts`)

```ts
export const SimTurnRequest = z.object({
  sessionId: z.string().min(8).max(64),
  householdId: zHouseholdId,
  text: z.string().trim().min(1).max(400),
  lang: zLanguageTag,                       // recognition language, e.g. en-IN
  inputMode: z.enum(["voice", "text", "chip"]),
  sttMs: z.number().int().nonnegative().optional(),
});
export const SimToolCall = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  ms: z.number(),
  ok: z.boolean(),
  result: z.unknown(),                      // EllieResult (structuredContent)
  fragment: z.string().optional(),          // which part of the utterance
});
export const SimTurnResponse = z.object({
  turnId: z.string(),
  speech: z.string(),                       // what to say aloud
  cards: z.array(z.unknown()),              // EllieResult.card[] in display order
  state: z.enum(["done", "awaiting_answer", "safety_stop", "not_understood"]),
  followUp: z.object({ question: z.string(), defaultValue: z.string().optional() }).optional(),
  calls: z.array(SimToolCall),
  router: z.object({ kind: z.enum(["llm", "deterministic"]), ms: z.number(), fallbackReason: z.string().optional() }),
  totalMs: z.number(),
  phoneNotified: z.boolean(),               // a message was sent this turn
});
```
CHANGELOG `## 1.6.0`. Mark `sim.ts` in a comment: "Simulator protocol — not part of the open home-event schema."

---

## 5. Orchestrator (`packages/server/src/simulator`)

### 5.1 `runTurn(req)` steps
1. **Clean** the text (`wake.ts`): strip a leading "alexa", "hey alexa", "ok alexa", "ask ellie (to)", "tell ellie (that)", and fillers ("um", "uh"). Empty after cleaning → reply *"Yes?"*, state `awaiting_answer` with no follow-up.
2. **Safety pre-check** on the **whole** utterance with Module 5 `checkSafety`, using the household's pack. If it hits:
   - run **only** `diagnose { item, symptom: whole text }` (item = best catalog match, else `"home"`) so the event is logged and the result is the stop message
   - skip every other fragment
   - state `safety_stop`
3. **Pending follow-up** in the session (§5.5)? If the utterance is an answer, fill `retry.args[argName]` and call `retry.tool`. If it is clearly a new request (the router finds a non-answer intent with score ≥ 0.8), drop the pending question and continue.
4. **Split** into fragments (§5.4).
5. **Route** each fragment to at most one tool call, with `SIM_MAX_TOOL_CALLS` per turn.
6. **Call tools in utterance order**, one at a time over the MCP client. Inject `householdId` into every call. Add context args (§5.6).
7. **Combine** results (§5.7).
8. Update the session: last item, last diagnosisId, last tool, pending follow-up, and a short history.
9. Return `SimTurnResponse` with timings.

### 5.2 Deterministic router (`routers/deterministic.ts`)
Ordered rules, first match wins per fragment. It uses `@ellie/schema` helpers: `matchCatalog`, `matchSymptom`, `matchComponent`, `detectEventType`, `parseRelativeDate`.

| # | Pattern (examples) | Tool | Args |
|---|---|---|---|
| 1 | "what's due", "anything due", "what do I need to do", "this week at home" | `due_this_week` | `days`: "this month" → 31, "next two weeks" → 14 |
| 2 | "when (is/will) … due/run out/need", "when should I change …" | `predict_next` | `item`, `component?` |
| 3 | "when did I last …", "history of …", "how often …" | `get_history` | `item`, `period` ("this year" → 1y) |
| 4 | "send (it/that/the steps/the link/summary) to my phone", "text me …" | `send_to_phone` | `contentType` from words or context (§5.6) |
| 5 | "it's fixed", "fixed it", "that worked", "the technician fixed …" | `log_resolution` | `diagnosisId` + top `causeKey` from context; `fix` = fragment; `byWhom` from "technician" |
| 6 | symptom words (`detectEventType` → `symptom`) | `diagnose` | `item`, `symptom` = fragment |
| 7 | changed / serviced / booked / delivered / cost words | `log_event` | `item`, `type`, `when` (relative phrase if present), `cost` (number + currency words), `component?` |
| 8 | "I live in …", "we're in …", "my number is …", "send things to …" | `setup_household` | `region`, `phone` + `consent: true` only when the user says "you can text me" or answers yes to the consent question |
| 9 | "what can you do", "help" | — | local reply (no tool): *"I remember things at home. Tell me when something's changed, ask what's due, or tell me what's wrong."* |
| 10 | "yes" / "sure" / "please" right after an offer (`suggestedNextTool` in the last result) | that tool | context args |
| 11 | "no" / "not now" after an offer | — | *"Okay."* |
| 12 | anything else | — | state `not_understood`: *"Sorry, I didn't catch that. You can say things like 'the gas is changed' or 'what's due this week'."* |

Items are resolved against the **current household's pack** (IN "gas" → cylinder, US "gas" → propane tank). Pronouns ("it", "that", "the same one") → the session's last item.

### 5.3 Bedrock router (`routers/bedrock.ts`)
Used when `SIM_ROUTER=llm`, or `auto` with the LLM driver resolved to `bedrock`.
- Build tool specs from **`client.listTools()`**: `toolSpec { name, description, inputSchema: { json: tool.inputSchema } }`. Leave out `ellie_dev_*` and `ellie_status`. Cache them per session.
- **One** Converse call per turn:
  - `system` = the server `instructions` (from the MCP initialize result) plus this text: *"You are routing for a voice assistant. Call one tool per thing the user mentioned, in order. Don't answer in text. householdId is filled in for you; never invent it."*
  - `messages` = the last 4 turns as short text summaries (user text and Ellie speech only), then the current utterance
  - `toolConfig: { tools, toolChoice: { auto: {} } }`
  - abort at `SIM_ROUTER_TIMEOUT_MS`
- Read every `toolUse` block (in order, up to `SIM_MAX_TOOL_CALLS`) into a `PlannedCall`. Don't run a second LLM pass: **speech comes from Ellie's results** (§5.7).
- Validate each planned call: the tool exists, and the args pass the tool's JSON schema (Ajv, or the Zod contract from `@ellie/schema`). Drop invalid calls.
- **Fallback** to the deterministic router on timeout, error, no tool calls, or all calls invalid. Record `fallbackReason`.
- Safety still runs **before** the router (§5.1 step 2). The LLM never decides safety.
- Never send phone numbers, email or names to the router. Redact digit runs of 7 or more as `⟦phone⟧` before sending, and restore them in the args afterwards.

### 5.4 Multi-intent splitting (`split.ts`)
- Use `splitAndMatch` from `@ellie/schema` (Module 2): split on " and ", ", ", " also ", " then ".
- **Don't split** when the second part has no item, symptom, event or question word, so it belongs to the first part. For example, "changed it and cleaned the housing" stays one fragment, and "between 3 and 4 weeks ago" is protected (don't split inside a date phrase).
- A fragment with no item inherits the previous fragment's item ("the gas is changed and it's leaking" → both gas).
- The Bedrock router gets the **whole** utterance; splitting is for the deterministic router only.

Hero sentence, IN: *"the cylinder's changed and the purifier is beeping again"* →
1. `log_event { item: "cylinder", type: "changed" }`
2. `diagnose { item: "purifier", symptom: "beeping again" }`

### 5.5 Follow-up state (`session.ts`)
- Store **at most one** pending follow-up: `{ question, retry, defaultValue, askedAt }`.
- When several tool calls in one turn return `followUp`, keep the **first** as pending and queue the rest. Ask a queued one on the next turn after the current one is answered. Never ask two questions in one reply.
- Answer handling:
  - "not sure", "don't know", "no idea" → `defaultValue`
  - "yes"/"no" for `confirm`/`consent` fields → boolean
  - for date-like fields, pass the raw phrase; the server parses it
  - for `answer` fields (diagnosis), pass the phrase; the server matches it to the allowed answers
- Pending expires after 2 minutes or when the household changes.
- Sessions live in memory with an idle timeout of 30 minutes and a maximum of 200. Each has its own MCP client session; close it when the sim session ends.

### 5.6 Context args (`orchestrator.ts`)
| Tool | Filled from session when missing |
|---|---|
| `send_to_phone` | `contentType`: last tool `diagnose` → `fix` + `diagnosisId`; `predict_next`/`log_event booked` → `booking` + item; `due_this_week` → `summary`; otherwise ask *"Should I send the fix steps or a booking link?"* (deterministic local follow-up) |
| `log_resolution` | `diagnosisId`, `causeKey` (top candidate) and `item` from the last diagnosis in the last 30 minutes; none → let the tool ask |
| `predict_next`, `get_history`, `diagnose` | `item` = last item if the fragment says "it"/"that" |

### 5.7 Combining results (`combine.ts`)
1. Any `safety.level === "stop"` → reply = that speech **only**, state `safety_stop`, and cards = the safety card only.
2. Otherwise, join each result's `speech` in call order.
   - If there's more than one call, drop a trailing offer sentence ("Want the steps on your phone?") from all but the **last** result.
   - Cap the total at 4 sentences: drop the second sentence of earlier results first.
3. If a pending follow-up exists, append its question **last** (it's already part of that result's speech under Module 3's `toolResponse` rule; don't duplicate it). State `awaiting_answer`.
4. Cards are the results' `card`s in order.
5. `phoneNotified` is true if any call was `send_to_phone` with status `sent` or `queued`.
6. A tool error → use its error speech for that part and continue with the others.

### 5.8 API (`simulator/api.ts`)
| Route | Does |
|---|---|
| `POST /api/sim/session` | body `{ householdId }` → `{ sessionId, household summary, suggestions[], voiceLang }` |
| `POST /api/sim/turn` | `SimTurnRequest` → `SimTurnResponse` |
| `POST /api/sim/household` | switch the household for the session; clears pending follow-ups |
| `GET /api/sim/state?sessionId=` | last item, pending question and router kind (for the dev drawer) |
| `GET /api/sim/app-resource` | returns the `ui://ellie/card.html` content read via the MCP client (`resources/read`), for the Host view (§6.6) |

Suggestions per household (chips):
- **demo-blr:** "What's due this week?", "The cylinder's changed and the purifier is beeping again", "Send it to my phone", "It's fixed", "When is the gas due?", "Show the purifier history"
- **demo-tx:** "What's due this week?", "The propane tank got refilled", "The furnace filter is changed", "My water heater has no hot water"
- **fresh** (`hh_sim-<random>`): "I live in Bengaluru", "I just changed the gas", "About five weeks ago"

---

## 6. Simulator UI (`packages/simulator`)

### 6.1 Layout (desktop ≥ 1280 px)
```text
┌───────────────────────────────────────────────────────────────┬───────────────┐
│ Household ▾  [Bengaluru • en-IN • IST]   Clock: Fri 16 Oct 09:00 ⏩ │  Phone frame  │
├───────────────────────────────────────────────────────────────┤  (messages /  │
│                  ┌──── Echo Show 1024×600 ────┐               │   phone page) │
│                  │  cards / idle clock screen  │               │               │
│                  │  caption (Ellie's speech)  │               │               │
│                  └──────── light bar ─────────┘               │               │
│        [ 🎤 hold to talk ]  [ type here…           ] [Send]    │               │
│        chips: What's due this week? · The cylinder's …          │               │
├───────────────────────────────────────────────────────────────┴───────────────┤
│ Timeline: STT 620 ms │ router 4 ms (deterministic) │ log_event 38 ms │ diagnose 61 ms │
└────────────────────────────────────────────────────────────────────────────────┘
```
Below 1280 px, stack the panels. The Echo Show frame scales with CSS `transform: scale()` to keep its 1024×600 ratio.

### 6.2 Echo Show frame
- **Idle screen:** large local time (household time zone and fake clock), date, and the top `due_this_week` item as a small banner (fetched on household switch and after each turn).
- **Results:** `CardStack` shows one card full-size, or two side by side for multi-intent, and a carousel with dots for three or more. Each card uses `<Card>` from `@ellie/ui`. Card actions:
  - `tool` actions → become a turn with `inputMode: "chip"` and a synthetic text, e.g. "See history" → "show the purifier history". Show it in the transcript as a tap, not as speech.
  - `url` actions → open in the phone frame if same-origin (`/phone/`, `/l/`), else a new tab.
- **Caption:** Ellie's speech text, highlighted word by word in sync with `SpeechSynthesis` boundary events when available.
- **Light bar** states and colours:

  | State | Colour |
  |---|---|
  | idle | off |
  | listening | cyan |
  | thinking | blue, moving |
  | speaking | blue, pulsing |
  | awaiting_answer | cyan pulse; the mic re-opens automatically after speech ends, for 8 s |
  | safety_stop | red, steady; the caption and card stay until dismissed |
  | not_understood | brief orange |

### 6.3 Voice (`voice/`)
- **Recognition:** `window.SpeechRecognition || window.webkitSpeechRecognition`.
  - `lang` = household language (`en-IN`, `en-US`), `interimResults: true` (show live text), `continuous: false`, `maxAlternatives: 1`.
  - Push-to-talk: hold the button or press Space (when the text box isn't focused). Release ends it; there's also an 8 s timeout.
  - Measure `sttMs` from speech end to the final result.
  - Not supported (Firefox/Safari partial) → hide the mic and show a note: "Voice needs Chrome or Edge — type instead." The text input always works.
  - Mic permission denied → a friendly message and a text fallback.
- **Synthesis:** pick a voice that matches the household language exactly, then the language prefix, then the default. Rate 1.0. Cancel any current speech before a new turn. A **mute** toggle shows captions only.
- **Barge-in:** pressing the mic while Ellie speaks stops the speech.
- No audio is ever sent to the server. Only text is.

### 6.4 Phone panel
- A 390×844 frame with two tabs: **Messages** and **Browser**.
- **Messages:** polls `GET /api/outbox?householdId=` every 2 s (and right after a turn with `phoneNotified`). It shows SMS-style bubbles with time, channel and the short link. New messages give a gentle buzz animation and an unread badge.
- Tapping a link opens **Browser** with an iframe of the link. This needs the `/phone/` CSP to change from `frame-ancestors 'none'` to `frame-ancestors 'self'` (same-origin only; still blocks other sites). Update the Module 7 static headers and their test.
- In Vite dev (5173), iframe `http://127.0.0.1:8787/l/<code>` (proxied through the Vite dev server, so it stays same-origin).

### 6.5 Controls
- **Household switcher:** demo-blr, demo-tx and "Fresh home". Switching calls `/api/sim/household`, clears the caption and cards, sets the recognition and voice language, and reloads the chips and idle banner.
- **Time controls:**
  - presets: "Now (16 Oct)", "+7 days", "Day 30 → reminder (18 Nov 09:05 IST)", "Reset"
  - each calls `/api/dev/time-travel` and shows `firedJobs` as a toast; new outbox messages appear in the phone panel
  - **Reseed** button → `POST /api/dev/seed { reset: true, anchor }` with a confirm dialog
  - All dev controls are hidden when the server reports production.
- **Router badge:** shows "LLM (Bedrock)" or "Deterministic", plus the fallback reason if any.

### 6.6 Dev drawer, timeline and Host view
- **Timeline:** per turn, horizontal bars for STT, router and each tool call (ms), with a 500 ms marker. Tool bars over 500 ms are red. Keep the last 10 turns.
- **Dev drawer** (toggle with the `` ` `` key): the transcript and, per turn, the tool calls with args, `structuredContent` (collapsible JSON) and router info. "Copy as JSON" for the friction log.
- **Host view toggle (§0.5):** for the current turn's first card-bearing result, render the real MCP App:
  1. Get the HTML from `/api/sim/app-resource`.
  2. Load it into `<iframe sandbox="allow-scripts" srcdoc=…>` (no `allow-same-origin`).
  3. Implement the host side of MCP Apps with the `@modelcontextprotocol/ext-apps` host bridge if it's available (check its exports, e.g. an `AppBridge`). Otherwise use a minimal `postMessage` JSON-RPC host following the spec: initialise, send the tool result, handle the view's tool-call requests by running them as sim turns and returning results, and handle open-link requests.
  4. A side-by-side comparison with the native `<Card>`.
  - Log which bridge was used and whether the view's action call worked, then record it in the friction log.

### 6.7 Accessibility and polish
- Everything works by keyboard. The mic button has `aria-pressed`, and the caption region is `aria-live="polite"`.
- Respect `prefers-reduced-motion`: no light-bar animation.
- Use colour tokens from `@ellie/ui`; follow dark mode.
- JS ≤ 200 KB gzipped (the simulator is a laptop app). Enforce it in a bundle test.

---

## 7. Serving
- If `packages/simulator/dist` exists and the simulator is enabled, serve it at `/sim/` with SPA fallback. Headers:
  - CSP `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'`
  - `media-src 'self'` (speech uses browser APIs, not network)
- Add `GET /` → 302 to `/sim/` when the simulator is enabled. This is handy for the demo.
- The startup banner adds: `simulator  http://127.0.0.1:8787/sim/  (router: deterministic)`.
- `.vscode/launch.json`: add "Open simulator" (a Chrome launch at `/sim/`).

---

## 8. Expected results (anchor 2026-10-16, fake clock 09:00 IST, mock drivers, deterministic router)

| # | Household | Say | Calls | Expected reply / UI |
|---|---|---|---|---|
| 1 | demo-blr | "Alexa, what's due this week?" | `due_this_week` | *"Your purifier's filter is about 3 months overdue, and your gas cylinder is due today."* One card. |
| 2 | demo-blr | **"Alexa, the cylinder's changed and the purifier is beeping again"** | `log_event` → `diagnose` | Gas sentence with *"23 November"* and *"18th"*, then the filter-overdue diagnosis mentioning March and the warranty to 20 December. Two cards side by side. ≤ 4 sentences. Total server time < 500 ms per tool. |
| 3 | demo-blr | "Send it to my phone" | `send_to_phone {contentType: fix, diagnosisId}` | *"Sent the steps to your phone ending 0001."* The phone panel buzzes; the message has a `/l/` link. Tapping it opens the fix page in the frame. |
| 4 | demo-blr | "It's fixed" | `log_resolution` | Mentions *"14 April"*. |
| 5 | demo-blr | "Alexa, I can smell gas and the AC isn't cooling" | `diagnose` only | Gas stop message with 1906; red light bar; **no** AC call. |
| 6 | Fresh home | "I live in Bengaluru" | `setup_household` | Confirms India settings (or asks the confirm question). |
| 7 | Fresh home | "I just changed the gas" | `log_event` | *"Got it. Roughly when was the previous gas cylinder changed?"* The mic re-opens. |
| 8 | Fresh home | "about five weeks ago" | retry `log_event {previousWhen}` | *"Thanks — about 5 weeks apart. Next one around …"* |
| 9 | Fresh home | "I'm not sure" (to a new question) | retry with `defaultValue` | Proceeds; the question is never asked again. |
| 10 | demo-tx | "What's due this week?" | `due_this_week` | Propane Tuesday, HVAC filter Thursday. US voice (en-US). |
| 11 | demo-tx | "The gas tank got refilled" | `log_event` | "gas" → **propane tank**. |
| 12 | demo-blr | Time control "Day 30 → reminder" | time travel | Toast "1 reminder sent"; a new message in the phone panel with a booking link → booking page with WhatsApp REFILL. |
| 13 | any | "Sing me a song" | — | `not_understood` reply; orange light. |
| 14 | demo-blr | Host view on turn 1 | — | The MCP App card renders in the sandboxed iframe; its "predict_next" action runs and re-renders. |

With Bedrock keys set (`SIM_ROUTER=auto`), rows 1–11 must give the same tool calls. Small speech differences are fine, because speech still comes from Ellie.

---

## 9. Tests

| Package / file | Must cover |
|---|---|
| server `sim.wake.test.ts` | wake word and filler stripping; empty → "Yes?" |
| server `sim.split.test.ts` | hero split; date phrases not split; item inheritance; "and" inside one action stays joined |
| server `sim.router.deterministic.test.ts` | a table of 30 or more utterances → tool + args (both households), including pronouns, "yes" after an offer, numbers + currency ("paid 1250 rupees for the AC service" → cost 1250), US "gas" → propane |
| server `sim.router.bedrock.test.ts` | `aws-sdk-client-mock`: tool specs built from `listTools` (dev tools excluded); toolUse → PlannedCalls in order; invalid args dropped; timeout/error → deterministic with the reason; phone digits redacted in the request and restored in the args |
| server `sim.followup.test.ts` | one pending at a time; queue; "not sure" → default; a new intent drops pending; expiry; household switch clears it |
| server `sim.combine.test.ts` | safety-only rule; offer sentence dropped from earlier results; 4-sentence cap; error parts; `phoneNotified` |
| server `sim.api.test.ts` | production gating (disabled; access code required; timing-safe compare); rate limit; session limits; MCP client reconnects after the server-side session closes |
| server `journey5.simulator.integration.test.ts` | §8 rows 1–13 through `/api/sim/turn` with the real MCP client loopback (serial project) |
| server `static.test.ts` (extend) | `/sim/` served and gated; `/phone/` `frame-ancestors 'self'`; `/` redirect |
| simulator `voice.test.ts` | mocked `SpeechRecognition` (interim + final, permission denied, unsupported → text only); synthesis voice selection and cancel on barge-in |
| simulator `EchoShow.test.tsx` | light-bar states; one, two and three-plus cards layout; caption `aria-live`; card tool action → chip turn |
| simulator `PhonePanel.test.tsx` | outbox polling renders bubbles; unread badge; link opens the Browser tab iframe with the right src |
| simulator `Controls.test.tsx` | household switch resets state and language; time controls call the API; dev controls hidden in production |
| simulator `McpAppHost.test.tsx` | the iframe sandbox has no `allow-same-origin`; the host bridge answers initialise; a tool-call request from the view triggers a sim turn |
| simulator `a11y.test.tsx` + phone `a11y.test.tsx` | no axe violations (§0.4) |
| simulator `bundle-size.test.ts` | ≤ 200 KB gzipped |

All earlier tests stay green.

---

## 10. Docs and rules
- `README.md`: a "Demo with the simulator" section (one command, `npm run dev`, open `/sim/`; browser support; the hero-sentence walkthrough with screenshots at 1440×900), router modes, production gating, and the Host view explanation.
- `docs/modules.md`: Module 8 → ✅; the commit history table (§0.1).
- `docs/friction-log.md`: rows for Web Speech browser support and permissions, the Bedrock tool-use schema mapping, iframe/CSP for the phone frame, and the MCP Apps host bridge outcome.
- `.github/copilot-instructions.md` append:
  ```markdown
  ## Simulator rules (Module 8+)
  - The simulator calls Ellie only through a real MCP client over Streamable HTTP. Never import domain code into the orchestrator's call path.
  - Safety check runs on the whole utterance before any routing; a hit runs only diagnose and returns the stop message.
  - Routers choose tools and args only. Spoken words always come from Ellie's tool results.
  - One question per reply; extra follow-ups are queued.
  - Never send phone numbers, email or names to the router LLM.
  - Every fix is a new commit; never amend or rewrite history.
  ```

---

## 11. Verification

### 11.1 Full check
```bash
npm install
npm run build            # schema → ui → phone → mcp-app → simulator → server
npm run typecheck && npm run lint && npm run validate:packs
npm test
SEED_ANCHOR_DATE=2026-10-16 npm run seed:reset
ELLIE_FAKE_NOW=2026-10-16T09:00:00+05:30 npm run dev
npm run smoke
```
Open **http://127.0.0.1:8787/sim/** in Chrome or Edge and allow the microphone.

### 11.2 Rehearsal (this is your demo)
Go through §8 rows 1–14 in order, **by voice**, with the Bengaluru household and then Texas. Note the timeline numbers for the README. If recognition mishears "cylinder's", use the chip; the demo must never depend on speech recognition alone.

### 11.3 With Bedrock (when you add keys)
`SIM_ROUTER=auto` with the Bedrock LLM driver active → the router badge says "LLM (Bedrock)". Repeat rows 1–11; the dev drawer shows the same tool calls. Check the router time in the timeline. If it's often over `SIM_ROUTER_TIMEOUT_MS`, keep `SIM_ROUTER=mock` for the live demo and mention Bedrock routing as tested.

---

## 12. Definition of Done — Module 8
- [x] §0 follow-ups committed separately (commit history table, no-amend rule, Module 7 §0 traceability, axe tests, Host view verification)
- [x] `@ellie/schema` 1.6.0 simulator protocol (marked as not part of the OSS schema)
- [x] Orchestrator uses a real MCP client loopback; safety pre-check; multi-intent split; one question per reply with a queue; context args
- [x] Deterministic router passes the 30+ utterance table; Bedrock tool-use router with validation, redaction and fallback
- [x] Simulator UI: Echo Show frame, light bar, card stack, captions, push-to-talk voice with a text fallback, mute, barge-in
- [x] Phone panel shows the outbox and opens the phone page in a same-origin frame
- [x] Household switcher, time controls, reseed, timeline, dev drawer, Host view
- [x] Served at `/sim/` (one process); gated in production with an access code
- [ ] §8 rows match; no axe violations; bundle ≤ 200 KB; all tests green
- [x] Docs, Copilot rules and friction log updated; commit: `git commit -m "Module 8: simulated Alexa+ web app"`

## 13. Out of scope for Module 8
`what_do_you_know`, `forget_item`, consent records and OAuth (Module 9); the scripted demo runner, pack value verification, Docker, schema repo extraction and the final README polish (Module 10).
