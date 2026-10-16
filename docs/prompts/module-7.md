# Ellie — Module 7: Phone Fix Page, Phone Chat & MCP Apps View

> **How to use this file**
> 1. Module 6 must be committed (`2df8b37` follow-ups + `afdcac6` Module 6; 23 schema + 94 server tests green).
> 2. Save this file as `docs/prompts/module-7.md`.
> 3. In **Copilot Chat → Agent mode** send:
>    `Implement everything in #file:docs/prompts/module-7.md exactly. Follow #file:.github/copilot-instructions.md. Do section 0 first and commit it separately, then work section by section, run the verification at the end, and fix any failures before stopping.`
> 4. Run **Verification** yourself and tick the **Definition of Done**.

---

## 0. Module 6 review fixes (do these first, commit as `Module 6 follow-ups`)

Module 6 is accepted. The build log shows five things to tidy before building on top of it.

### 0.1 TTL clock is chosen by key prefix inside the memory adapter
To fix the 404 after time travel, the memory adapter now applies wall-clock TTL to some key prefixes (links, FIRED markers) and fake-clock TTL to others. That works, but the storage adapter now knows about business keys, and the next module to add a record type will get it wrong. Fix:
- Add an optional `ttlClock: "app" | "wall"` field to `StoredRecord` (default `"app"`).
- Only `keys.ts` builders decide it: `LINK#…`, `LINK…#ACTION#…`, chat records (§6) and `FIRED#…` use `"wall"`. `PENDING#`, `DEDUPE#` and `DIAG#` stay `"app"`.
- Memory, file and DynamoDB adapters check expiry on read with `ttlClock === "wall" ? Date.now() : clock.now()`. Remove all prefix checks from the adapters.
- DynamoDB's own TTL deletion is always wall-clock, which is fine: app-clock records are only ever *shortened* by time travel in the read filter.
- Add a storage contract test for both clocks after `clock.set(+30 days)`.

### 0.2 Schema changed without a version bump
`Diagnosis` gained optional safety metadata (category and emergency number) after 1.4.0. Bump `@ellie/schema` to **1.4.1**, add a CHANGELOG line, and confirm `gen:jsonschema` output is committed.

### 0.3 Smoke test doesn't cover the phone path
`npm run smoke` only lists tools. Extend `scripts/smoke.ts`:
1. Call `send_to_phone { householdId: "demo-blr", contentType: "summary" }` and read `structuredContent.data.shortUrl`.
2. `fetch(shortUrl, { redirect: "follow" })` and assert 200 and that the HTML contains "This week".
3. Exit 1 on failure. (Use the smoke server's own port for the short-link base URL, like the Journey 1 test fix.)

### 0.4 Confirm the Module 5 AC rule tests
Module 6 §0.1 asked for two AC preferred-month cases. List the two test names under Module 5 in `docs/modules.md` so they're traceable. If either is missing, add it.

### 0.5 Read-only AWS check for later
Real SNS, EventBridge, DynamoDB and Bedrock haven't run against AWS yet. Add `scripts/aws-check.ts` (`npm run aws:check`). With whatever keys are in `.env`, it makes **read-only** calls only:
- `DescribeTable`
- Bedrock `Converse` with a 5-token "ping" (opt-in flag `--bedrock`, because it costs money)
- `GetTopicAttributes`
- `GetScheduleGroup`
- `GetQueueAttributes`

It prints a ✔ / ✖ / skipped table with the missing key or the AWS error name. It never creates, sends or deletes anything. You'll use it at the end when you insert keys.

---

## 1. Goal of this module

Build what the user sees **on the phone**, plus the same card inside MCP hosts. After this module:

1. A **React phone page** (`packages/phone`) opens from the Module 6 short link and shows fix steps, booking, or the weekly summary.
2. Steps can be ticked off, and the page has three buttons: **Fixed it**, **Didn't work** and **I booked it**. They use the Module 6 phone API.
3. **Phone chat** answers follow-up questions about the current fix, using only the diagnosis evidence and fix plan. It runs the safety gate first and validates citations.
4. The page works in **English, Hindi, Kannada, Tamil and Spanish** for its own labels. Content is translated by the LLM when Bedrock is on; with the mock, it stays in English and says so.
5. A shared **`@ellie/ui`** package renders `EllieResult.card` and `PhoneView`. The phone page uses it now, and the simulator reuses it in Module 8.
6. An **MCP Apps view** (`ui://ellie/card.html`) shows Ellie's card inside hosts that support MCP Apps (VS Code, Claude and others), with working buttons. Alexa+ keeps using speech; nothing changes for hosts without MCP Apps.
7. The server serves the built phone page at `/phone/`, so **one process** runs everything in the demo. Module 6 short links redirect there automatically.

### Scope guard
| Build now | Do NOT build yet |
|---|---|
| §0 fixes, `@ellie/ui`, `packages/phone`, phone chat API, translation API, MCP Apps view on 5 tools, static serving, tests | Simulated Alexa+ app and voice (Module 8); `what_do_you_know`, `forget_item`, OAuth (Module 9); demo runner, pack verification (Module 10) |

---

## 2. Packages and files

```text
packages/
├─ ui/                               # NEW @ellie/ui (React components, browser-only)
│  ├─ package.json
│  ├─ src/
│  │  ├─ index.ts
│  │  ├─ tokens.css                  # colours, spacing, dark mode
│  │  ├─ Card.tsx                    # renders EllieResult.card
│  │  ├─ PhoneViewRenderer.tsx       # renders PhoneView sections
│  │  ├─ ActionButton.tsx
│  │  ├─ StatusPill.tsx              # ok | due | overdue | warning | info
│  │  ├─ SafetyBanner.tsx
│  │  └─ i18n/
│  │     ├─ index.ts                 # t(key, lang), plural rules via Intl
│  │     ├─ en.json  hi.json  kn.json  ta.json  es.json
│  └─ test/
├─ phone/                            # NEW @ellie/phone (Vite + React app)
│  ├─ package.json
│  ├─ index.html
│  ├─ vite.config.ts                 # base "/phone/", dev proxy /api → 8787
│  ├─ public/manifest.webmanifest
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ App.tsx                     # route by view.kind
│  │  ├─ api.ts                      # token-aware fetch client
│  │  ├─ token.ts                    # read ?t, store in sessionStorage, strip from URL
│  │  ├─ pages/FixPage.tsx
│  │  ├─ pages/BookingPage.tsx
│  │  ├─ pages/SummaryPage.tsx
│  │  ├─ pages/ErrorPage.tsx         # expired / invalid / offline
│  │  ├─ components/StepList.tsx     # tickable steps
│  │  ├─ components/Chat.tsx
│  │  ├─ components/LanguagePicker.tsx
│  │  └─ components/DoneBanner.tsx
│  └─ test/
├─ mcp-app/                          # NEW @ellie/mcp-app (single-file HTML build)
│  ├─ package.json
│  ├─ vite.config.ts                 # vite-plugin-singlefile → dist/card.html
│  ├─ index.html
│  └─ src/main.tsx                   # MCP Apps client: render card, call tools
├─ schema/src/phone.ts               # CHANGED: chat + translation schemas (1.5.0)
└─ server/src/
   ├─ http/phoneChat.ts              # NEW
   ├─ http/phoneTranslate.ts         # NEW (or inside phoneApi.ts ?lang=)
   ├─ http/static.ts                 # NEW: serve phone + mcp-app builds
   ├─ phone/chat.ts                  # NEW: grounded chat engine
   ├─ phone/translate.ts             # NEW: cached, validated translation
   ├─ llm/mockHandlers.ts            # CHANGED: chat + translate handlers
   └─ mcp/apps.ts                    # NEW: register ui:// resource + tool _meta
```

Root `package.json` workspaces already cover `packages/*`. Add these scripts:
```json
"dev:phone": "npm run dev -w @ellie/phone",
"build:ui": "npm run build -w @ellie/ui && npm run build -w @ellie/phone && npm run build -w @ellie/mcp-app",
"dev:all": "concurrently -n server,phone \"npm run dev\" \"npm run dev:phone\""
```
Make the root `build` run schema → ui → phone → mcp-app → server. Add `concurrently` as a root dev dependency.

### 2.1 Tech choices (fixed)
| Concern | Choice |
|---|---|
| UI | React 18 + TypeScript, Vite 5 |
| Styling | Plain CSS modules + `tokens.css` (no UI framework, keeps the bundle small) |
| State | React state + `fetch`; no Redux or React Query |
| Tests | Vitest + `@testing-library/react` + `jsdom` |
| MCP Apps | `@modelcontextprotocol/ext-apps` (server helpers + client `App`), see §8 |
| Single-file HTML | `vite-plugin-singlefile` |

`@ellie/ui` depends on `@ellie/schema` types only and must stay browser-safe, like the schema package.

---

## 3. Schema 1.5.0 (additive only)

```ts
export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(["user", "ellie"]),
  text: z.string().max(600),
  citedEvidenceIds: z.array(z.string()).default([]),
  source: z.enum(["llm", "deterministic", "safety"]).optional(),
  createdAt: zIsoUtc,
});
export const PhoneChatRequest = z.object({ message: z.string().trim().min(1).max(500) });
export const PhoneChatResponse = z.object({
  reply: ChatMessage,
  safety: z.object({ level: SafetyLevel, number: z.string().optional() }).optional(),
  remaining: z.number().int().nonnegative(),    // messages left on this link
});
export const PhoneUiLanguage = z.enum(["en", "hi", "kn", "ta", "es"]);
// PhoneView gains:
translated: z.object({ to: zLanguageTag, by: z.enum(["llm", "none"]), complete: z.boolean() }).optional(),
```
`PhoneView.actions[].id` adds `"chat"` (shown only when chat is available). CHANGELOG `## 1.5.0 — 2026-10-20`.

---

## 4. `@ellie/ui` components

### 4.1 Design tokens (`tokens.css`)
- Base font size 17 px, line height 1.5, minimum tap target 48 × 48 px.
- Colours meet WCAG AA contrast in light **and** dark mode (`prefers-color-scheme`).
- Status colours: ok green, due amber, overdue red, warning orange, info blue. Each status also gets an icon and text, never colour alone.
- Respect `prefers-reduced-motion`.

### 4.2 `<Card card={Card} onAction={(a) => void} lang />`
- Renders title, subtitle and items with `<StatusPill>`.
- Each action button: `url` → anchor; `tool` → calls `onAction`.
- Used by the MCP App view and the Module 8 simulator.

### 4.3 `<PhoneViewRenderer view onAction lang />`
- Sections render by tone. `safety` uses `<SafetyBanner>` with a large call button. `warning` gets a yellow outline.
- Ordered lists use `<ol>`. List items never render HTML (text only).
- External links (`wa.me`, `tel:`, shop) get `rel="noopener noreferrer"` and `target="_blank"`, except `tel:` and `sms:`.

### 4.4 i18n
- `t(key, lang, vars)` reads from flat JSON dictionaries with about 40 keys: buttons, headings, errors, chat placeholder, "translated by", "expires", and step counters.
- Missing keys fall back to `en` and log a warning in dev.
- Dates and numbers use `Intl` with the full language tag (`kn-IN`).
- Hindi, Kannada, Tamil and Spanish strings are **starter translations**: add `"_meta": { "reviewed": false }` to each file and list them in the friction log for a native-speaker review.

---

## 5. Phone page (`packages/phone`)

### 5.1 Token handling (`token.ts`)
1. On load, read `?t=`. Save it to `sessionStorage` (`ellie.t`), then remove it from the address bar with `history.replaceState`. This keeps the token out of screenshots and history.
2. Send it as `Authorization: Bearer <token>` on every API call. Never put it in a URL again.
3. Add `<meta name="referrer" content="no-referrer">` to `index.html`.
4. No token → error page "Open the link from your message again."

### 5.2 Loading and errors
- `GET /api/phone/view?lang=<ui lang>` with a skeleton loader. Target first paint under 1.5 s on a mid-range phone with 4G.
- 401/403 → "This link isn't valid." 410 → "This link has expired. Ask Alexa to send it again." Network error → retry button + "You're offline" message.
- The page title is the view title.

### 5.3 Fix page
- Header: item, symptom and the "most likely" line with cited evidence (from the Module 6 fix view).
- **StepList**: numbered steps with a checkbox each. Ticks are saved in `localStorage` per diagnosis (`ellie.steps.<ref>`), so a refresh keeps progress. A progress line reads "3 of 6 done". The safety note is shown above step 1.
- "You'll need" parts list and "Call a professional if" list. The warranty line is highlighted.
- Buttons: **Fixed it** (`POST …/fixed`, then shows "Great — next filter due 14 April"), **Didn't work** (`POST …/not_fixed`, then switches to the call-a-pro view), **Manual** (external link) and **Ask a question** (opens chat).
- Safety-stop views show **only** the safety banner and a big call button (e.g. `tel:1906`). No steps, no chat, no other buttons.

### 5.4 Booking page
- Shows When (next due, bookings open, lead time) and How (channel, plus the "send from your registered number" note).
- A big **Book on WhatsApp** / **Call to book** / **Order online** button, then **I booked it** → `POST …/booked` → "Noted — I'll check it arrived around Monday, 19 October."

### 5.5 Summary page
- Groups items as Overdue, Due, Due soon and Warranty, with status pills.
- Each item with a provider gets a book button.

### 5.6 Language picker
- Default: `view.language` mapped to a UI language (`kn-IN` → `kn`), else `en`.
- Changing the language re-fetches `/api/phone/view?lang=` and saves the choice in `localStorage`.
- If `view.translated.by === "none"` and the language isn't English, show a small notice in that language: "Steps shown in English."

### 5.7 PWA basics
`manifest.webmanifest` with name "Ellie", theme colour and icons (generate simple SVG/PNG icons at build). **No service worker**: content must always be fresh and tokens must not be cached.

### 5.8 Budgets
- JS ≤ 120 KB gzipped (check with `vite build` output; fail the test script if larger).
- Lighthouse mobile accessibility ≥ 95 (manual check, noted in the friction log).

---

## 6. Phone chat

### 6.1 API — `POST /api/phone/chat` (token-scoped, enabled in production)
- Only for `kind = fix` views that are **not** safety stops. Otherwise → 404 `chat_unavailable`.
- Limits: 20 messages per token (store a count with the link record) and the Module 6 rate limiter. Over the limit → "I've answered a lot here — ask Alexa if you need more."
- Store the conversation at `pk LINK`, `sk <code>#CHAT#<iso>#<id>` with `ttlClock: "wall"` and the same expiry as the link. `GET /api/phone/chat` returns history.

### 6.2 Engine (`phone/chat.ts`)
Steps, in order:
1. **Safety gate first** (Module 5 `checkSafety`) on the user message. If it hits, reply with the stop message and number, set `source: "safety"`, and **disable chat for this link** for the rest of the session.
2. **Scope check**: the context is only the diagnosis (evidence, candidates, fix plan, warranty) plus pack fix text for the top 3 causes. Questions outside the item ("what's the weather?") get a deterministic "I can only help with this {item} fix."
3. **Deterministic answers** for common intents, matched by keywords in the five UI languages' English equivalents:

   | Intent | Answer from |
   |---|---|
   | which step / next step | first unticked step (client sends `ticked: number[]` with the message; add it to `PhoneChatRequest` as optional) |
   | how long | `fixPlan.timeMinutes` |
   | parts / what to buy | `partsNeeded` |
   | warranty | warranty evidence |
   | call a pro / technician | `callProIf` + the provider call action if one exists |
   | why / cause | top candidate + cited evidence |

4. Otherwise, call the **LLM** (system prompt `CHAT_PROMPT_V1`, same rules as Module 5):
   - Answer only from the given context.
   - Cite evidence ids, or the fix step ids `step_1`..`step_n` (add these to the context).
   - At most 3 sentences, plain text, in the page language.
   - Say "I'm not sure — please call a technician" when the context doesn't cover the question.
5. **Validate** with the Module 5 validator rules: citations must exist; no dates, numbers or prices outside cited text; no new parts; no instructions that contradict a `diy: false` cause or a safety note. On rejection → the deterministic fallback "I'm not sure about that. {callProIf[0]}".
6. Never send phone numbers, email, household id, region, names or the token to the LLM. The last 6 chat turns are sent (user turns trimmed to 500 characters).
7. Timeout is `LLM_BACKGROUND_TIMEOUT_MS` (the phone isn't a voice turn), with a "thinking…" indicator in the UI.

### 6.3 Mock handler
Register a `CHAT_PROMPT_V1` handler that answers from the context with the first relevant step or evidence and correct citations, so the demo chat works with no keys.

### 6.4 UI (`Chat.tsx`)
- A bottom sheet with message bubbles and quick chips ("What do I need?", "How long?", "Is it under warranty?").
- Input limited to 500 characters, with `aria-live="polite"` for replies.
- Cited evidence appears as a small "Based on: Filter changed 18 Jan" line under each reply (text from the evidence).

---

## 7. Translation (`phone/translate.ts`)

`GET /api/phone/view?lang=kn` flow:
1. Build the English view (Module 6).
2. If `lang` is `en`, or the LLM driver is mock → return it with `translated: { to, by: "none", complete: false }` (mock keeps English, honestly labelled).
3. Otherwise translate **only text fields** (title, headings, bodies, list items, action labels) in one batched LLM call (`TRANSLATE_PROMPT_V1`). Ask for JSON in the same shape.
4. **Protect tokens**: before sending, replace URLs, phone numbers, emergency numbers, dates, numbers and brand names with placeholders `⟦0⟧`, `⟦1⟧`… Restore them after. Reject the result if any placeholder is missing or changed, and fall back to English.
5. Safety sections are **never** machine-translated. Use the pack's stop message (add optional `stopMessagesByLanguage` to the pack schema in 1.5.0, empty for now), else English.
6. Cache by `hash(view content) + lang` in storage (`pk TRANSLATION`, `ttl` 7 days).
7. Never send personal data (§6.2 rule 6).

---

## 8. MCP Apps view (`packages/mcp-app` + `server/src/mcp/apps.ts`)

MCP Apps is the stable MCP extension (spec 2026-01-26) for showing HTML views in hosts. The server registers an HTML resource with a `ui://` URI and MIME type `text/html;profile=mcp-app`, and tools point to it with `_meta.ui.resourceUri`. The `@modelcontextprotocol/ext-apps` package provides `registerAppTool` / `registerAppResource` server helpers and a client `App` class.

### 8.1 Compatibility check (do first)
Install `@modelcontextprotocol/ext-apps` and check its peer dependency on the MCP SDK.
- **If it supports `@modelcontextprotocol/sdk` v1:** use `registerAppResource` and add the `_meta` to tools.
- **If it needs SDK v2:** do **not** upgrade the SDK. Implement it by hand on v1:
  - `server.registerResource("Ellie card", "ui://ellie/card.html", { mimeType: "text/html;profile=mcp-app" }, read)`.
  - Add `_meta: { ui: { resourceUri: "ui://ellie/card.html" }, "ui/resourceUri": "ui://ellie/card.html" }` to the tool configs (both keys for older hosts).
- In the browser bundle, use only the client `App` from the package (it doesn't depend on the server SDK). If even that fails, write a minimal `postMessage` JSON-RPC client following the spec and record it in the friction log.

### 8.2 The view (`packages/mcp-app/src/main.tsx`)
- Build to one self-contained `dist/card.html` (inline JS and CSS, no external requests, so no CSP domains are needed).
- On connect, receive the tool result. Read `structuredContent` (`EllieResult`) and render `<Card>` from `@ellie/ui`, plus `speech` as the caption.
- Card actions:
  - `tool` actions → `app.callServerTool({ name, arguments })` (check the exact method names against the installed typings), then re-render with the new result.
  - `url` actions → ask the host to open the link (the ext-apps "open link" request).
- Light/dark follows host theme info if provided.
- Size ≤ 150 KB.

### 8.3 Server registration (`mcp/apps.ts`)
- The resource reads `packages/mcp-app/dist/card.html` at startup (cached). If it's missing, log a warning and skip MCP Apps entirely; tools still work.
- Attach `_meta.ui.resourceUri` to: `due_this_week`, `predict_next`, `get_history`, `diagnose`, `send_to_phone`.
- **Text output stays unchanged.** Hosts without MCP Apps (Alexa+, Inspector) see the same speech and structured content as before.
- `ellie_status` shows `mcpApps: { enabled, bytes }`.

---

## 9. Serving (`server/src/http/static.ts`)

- If `packages/phone/dist` exists, serve it at `/phone/` with SPA fallback to `index.html`. Hashed assets get `Cache-Control: public, max-age=31536000, immutable`. `index.html` gets `no-store`.
- Security headers on `/phone/*`:
  - `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
  - CSP `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`.
- `PHONE_PAGE_BASE_URL` default: if blank and the build exists → `${ELLIE_PUBLIC_BASE_URL}/phone`. Update `.env.example` to make it blank by default with a comment.
- Module 6 short-link redirect: when the phone page is served by this process, redirect to `/phone/?t=<token>` with **no** HEAD check. The fallback page `/p/<token>` stays for when the build is missing.
- In dev, Vite runs on 5174 and proxies `/api` to 8787. Short links then redirect to `http://localhost:5174/?t=` when `PHONE_PAGE_BASE_URL` points there.

---

## 10. Expected results (anchor 2026-10-16, fake clock 09:00 IST, mock drivers)

| Step | Expected |
|---|---|
| `diagnose` demo-blr purifier "beeping again" → `send_to_phone { contentType: "fix" }` → open the short link | `/phone/` loads; the token is gone from the address bar; the fix page shows 6 steps, the safety note, "sediment filter cartridge", the warranty line until 20 December and the Kent manual link |
| Tick steps 1–3, reload | Still ticked; "3 of 6 done" |
| Chat "what do I need?" | Deterministic answer listing the sediment filter cartridge, citing the fix plan |
| Chat "is it under warranty?" | Mentions 20 December, cites `ev_warranty` |
| Chat "I can smell gas" | Gas stop message with 1906; chat disabled afterwards |
| Chat "what's the weather?" | "I can only help with this water purifier fix." |
| Tap **Fixed it** | Banner shows next filter due 14 April 2027; history has the resolution; a second tap gives the same result |
| Language → Kannada (mock LLM) | Labels in Kannada; content in English with the "Steps shown in English" notice |
| Booking link for gas | Booking page with "Book on WhatsApp" (`wa.me/917588888824?text=REFILL`) and the registered-number note; **I booked it** → delivery check around Monday, 19 October |
| Summary link | Overdue: purifier filter; Due: gas cylinder (before the hero change) |
| Expired link (set link TTL to 1 s in a test) | Expired page with the "Ask Alexa to send it again" message |
| Safety-stop fix link (gas smell diagnosis) | Only the safety banner and `tel:1906` |
| MCP host with MCP Apps calls `due_this_week` | Card renders; the "predict_next" row action calls the tool and re-renders |
| MCP Inspector `tools/list` | `due_this_week` has `_meta.ui.resourceUri = ui://ellie/card.html`; `resources/list` has the `ui://` resource |

---

## 11. Tests

| Package / file | Must cover |
|---|---|
| server `storage.contract.test.ts` (extend) | §0.1 wall vs app TTL |
| server `smoke` | §0.3 runs in CI-style `npm run smoke` |
| ui `Card.test.tsx` | all status pills have text + icon; url vs tool actions; no HTML injection (render `<img onerror>` text safely) |
| ui `PhoneViewRenderer.test.tsx` | ordered list, warning/safety tones, safety section shows the call button |
| ui `i18n.test.ts` | every key exists in `en`; fallback to `en`; `Intl` dates per language |
| phone `token.test.ts` | reads `?t`, stores it, strips it from the URL, sends the Bearer header |
| phone `FixPage.test.tsx` | step ticks persist; Fixed it / Didn't work flows (mock fetch); safety-only view hides everything else |
| phone `BookingPage.test.tsx`, `SummaryPage.test.tsx` | buttons and links per channel |
| phone `errors.test.tsx` | 403 / 410 / offline pages |
| phone `bundle-size.test.ts` | reads the build output; JS ≤ 120 KB gzipped |
| server `phone.chat.test.ts` | safety first and chat disabled after; out-of-scope reply; each deterministic intent; LLM validation rejects uncited numbers or new parts; 20-message cap; no PII or token in the LLM request; history stored with wall TTL |
| server `phone.translate.test.ts` | mock → `by: none`; placeholder protection (URL, `tel:` number, date restored exactly); a missing placeholder → English fallback; safety section never sent to the LLM; cache hit on the second call |
| server `mcp.apps.test.ts` | resource registered with `text/html;profile=mcp-app`; the 5 tools carry `_meta.ui.resourceUri` (both keys if hand-rolled); text content unchanged; missing build → no `ui://` resource, tools still work |
| server `static.test.ts` | `/phone/` SPA fallback, cache headers, security headers, short-link redirect to `/phone/?t=` |
| `journey4.phone-page.integration.test.ts` | §10 rows using the HTTP API (the UI parts are covered by the component tests) |

All earlier tests stay green. UI tests run in the unit project; the journey test runs in the serial integration project.

---

## 12. Docs and rules
- `README.md`: a "Phone page" section with screenshots (take them from `npm run dev:all` at 390 × 844), a "Phone chat" section with its rules, an "MCP Apps" section (which hosts show the card; text fallback for others), and a languages section with the review status.
- `docs/modules.md`: Module 7 → ✅, plus the §0 follow-ups noted under Module 6.
- `docs/friction-log.md`: rows for the ext-apps SDK compatibility outcome, the translation review, bundle size and any Vite/workspace issues.
- `.github/copilot-instructions.md` append:
  ```markdown
  ## Phone page & UI rules (Module 7+)
  - Shared rendering lives in @ellie/ui; the phone page, MCP App view and simulator all use it. Never render HTML from data.
  - Tokens: read once from ?t, keep in sessionStorage, send as Bearer, strip from the URL. Never log them.
  - Safety views show only the safety banner and call button. Chat is off for safety stops and turns off after a safety hit.
  - Phone chat answers only from the diagnosis context, cites evidence or step ids, and goes through the same validator as diagnosis.
  - Translation protects URLs, numbers, dates and brand names with placeholders; safety text is never machine-translated.
  - Record TTL clock is chosen in keys.ts (ttlClock), never inside storage adapters.
  - MCP Apps are additive: text and structuredContent must stay complete for hosts without UI.
  ```

---

## 13. Verification

### 13.1 Full check
```bash
npm install
npm run build            # schema → ui → phone → mcp-app → server
npm run typecheck && npm run lint && npm run validate:packs
npm test
SEED_ANCHOR_DATE=2026-10-16 npm run seed:reset
ELLIE_FAKE_NOW=2026-10-16T09:00:00+05:30 npm run dev
npm run smoke            # now includes the short link → phone page check
npm run aws:check        # shows every AWS service as "skipped" with the missing keys
```

### 13.2 Phone page by hand
1. In MCP Inspector: `diagnose` demo-blr purifier "beeping again" → `send_to_phone { "contentType": "fix" }`.
2. Open the short URL from the terminal outbox box in Chrome DevTools device mode (iPhone 12 Pro).
3. Go through every row of §10.
4. Optional, real phone on the same Wi-Fi: `HOST=0.0.0.0`, `ELLIE_PUBLIC_BASE_URL=http://<laptop-LAN-IP>:8787`, and add that host to the DNS-rebinding allow list.

### 13.3 MCP Apps
1. In VS Code (MCP Apps support), with Copilot Agent mode connected through `.vscode/mcp.json`, ask: "What's due this week for demo-blr?" The card renders inline.
2. Use the `basic-host` example from the ext-apps repo as a second host if VS Code doesn't render it. Record which hosts worked in the friction log.

### 13.4 With Bedrock (when you add keys)
Switch the phone page to Kannada: content is translated, numbers and links are unchanged, and the badge reads "Translated". Ask chat a free-form question ("can I use it while the new filter settles?"): the answer cites steps or evidence, or says it's not sure.

---

## 14. Definition of Done — Module 7
- [x] §0 follow-ups committed separately: explicit `ttlClock`, schema 1.4.1, phone smoke, AC test names listed, `aws:check`
- [x] `@ellie/schema` 1.5.0 chat and translation schemas
- [x] `@ellie/ui` Card + PhoneView renderer, accessible, light/dark, 5 UI languages (starter translations flagged for review)
- [x] Phone page: fix / booking / summary / error pages; token stripped from the URL; ticked steps persist; Fixed it / Didn't work / I booked it work; JS ≤ 120 KB gzipped
- [x] Safety views show only the banner and call button
- [x] Phone chat: safety first, scoped, deterministic intents, validated LLM answers, 20-message cap, no PII
- [x] Translation: mock labelled honestly; Bedrock path protects placeholders; safety text never translated; cached
- [x] MCP Apps view on 5 tools with working card actions; text output unchanged; skipped cleanly if the build is missing
- [x] Server serves `/phone/` with security headers; short links go there directly
- [x] §10 results covered by component, API, and integration tests; all tests green; smoke covers the phone path
- [x] Docs, Copilot rules and friction log updated; commit: `git commit -m "Module 7: phone page, phone chat and MCP Apps view"`

Verification caveats: live AWS checks were skipped because AWS configuration is absent. Bedrock translation/chat, Lighthouse scoring, and rendering in an external MCP Apps host were not exercised in this environment.

## 15. Out of scope for Module 7
Simulated Alexa+ web app, browser voice, multi-intent UI and household switcher (Module 8); `what_do_you_know`, `forget_item`, consent records and OAuth (Module 9); demo runner, pack value verification, schema repo extraction and Docker (Module 10).
