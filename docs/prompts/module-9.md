# Ellie — Module 9: Privacy and Trust (reconstructed)

> ## ⚠️ This file is a reconstruction, not the original prompt
>
> **Why it exists.** The Gate A audit (`bbe6754`) recorded finding **A-06**: Module 9 is the only module whose source prompt was never saved. A search of the full history confirms it — `git log --all --diff-filter=A -- "docs/prompts/*"` lists `module-1.md` … `module-8.md`, `module-10.md`, `module-11.md` and `module-12.md`, and has never contained `module-9.md`. No earlier copy exists in any commit or branch.
>
> **How it was rebuilt.** From three sources only, with no invented requirements:
>
> 1. the Module 9 implementation commit `086e048` ("Module 9: privacy and trust", 86 files) and its follow-up `c417b79` ("Module 9 follow-ups");
> 2. the roadmap row and verification note in [`docs/modules.md`](../modules.md) (`658e6a7`);
> 3. the "Privacy rules (Module 9+)" section that `086e048` added to [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md), plus [`docs/PRIVACY.md`](../PRIVACY.md) and [`.env.example`](../../.env.example) from the same commit.
>
> **What this means.** Everything below is **evidence of what was built**, expressed as requirements. It is *not* a record of what was asked for. Where the original prompt may have demanded more, this file cannot show it, so Module 9 must keep its `PARTIAL` status in the audit: implementation evidence cannot certify an unavailable specification. Do not treat the Definition of Done here as the original one.
>
> Prerequisite at the time: Module 8 committed (`9035db5`, follow-ups `334f0ce`). Resulting test totals: schema 26, server 142, UI 6, phone 19, simulator 11 — 204 total.

---

## 1. Goal of this module

Make Ellie trustworthy enough to hand a stranger. A household must be able to ask what Ellie knows, get it on their phone, delete one item or the whole home, withdraw message consent, and be sure that nothing personal reaches a log, a model or a message it shouldn't. Optional OAuth 2.1 resource protection prepares the server for a real host.

---

## 2. Schema (`@ellie/schema` 1.7.0)

- New `packages/schema/src/privacy.ts` with `HouseholdInventory`, `ForgetReceipt` and `ConsentRecord`, all browser-safe (no `fs`, `path`, `process`, `Buffer`).
- Four new tool contracts in `contracts.ts`: `what_do_you_know`, `forget_item`, `forget_household`, `manage_consent`.
- `phone.ts` gains the `privacy` link kind.
- Export the new types from `index.ts`, bump `version.ts` and add a `CHANGELOG.md` entry.

## 3. Redaction (`src/privacy/redact.ts`)

One module is the only place redaction happens. `redactText` masks phone numbers, e-mail addresses, `Bearer` tokens, JWTs, signed link tokens and `?t=` query tokens. `redactObject` walks any structure and blanks contact-shaped keys (`phone`, `email`, `token`, `authorization`, `contact`, `to`). It is wired into:

- `lib/logger.ts` (every Pino log line),
- `mcp/result.ts` (`toolResponse` and `toolError`, so no tool can leak),
- `adapters/llm/bedrock.ts` and `adapters/llm/mock.ts` (every model request),
- `adapters/notifier/console.ts` (the printed outbox),
- `app.ts` (the error handler) and `http/routes.ts` (the outbox route).

**Dates, day counts and quantities must survive redaction**; only contact details and tokens are masked.

## 4. Consent (`src/privacy/consent.ts`)

- `canSend(ctx, householdId, purpose)` is the single consent decision in the codebase. `domain/sendToPhone.ts` and `domain/reminders.ts` call it; no send path makes its own decision.
- Purposes: `phone_messages`, `email_messages`, `reminders`.
- Consent history records grant/withdraw, when, and the source of the change.
- Contact details are stored only with explicit consent and are masked wherever they are shown.

## 5. Inventory and export

- `src/privacy/inventory.ts` builds what Ellie knows: items, event counts, active service sharing (only drivers that are actually active), consent history and retention periods — with contacts masked.
- `src/privacy/export.ts` produces a JSON download of the household's own records.
- Both are reachable from the `what_do_you_know` tool and from the phone privacy page.

## 6. Forget cascade (`src/privacy/forget.ts`)

- `forgetItem` / `forgetHouseholdPlan` build a plan and a `planHash`; `executeForgetItem` / `executeForgetHousehold` carry it out and return a `ForgetReceipt`.
- The cascade covers every record type: items, events, predictions, resolutions, diagnoses, aliases, pending follow-ups, dedupe markers, short links and their action/chat children, outbox messages, translation cache entries, schedule mirrors and external scheduler jobs, household index rows and subject rows.
- Erasing a household leaves it reusable as an empty home, and keeps a **counts-only** audit record with no item names or contacts.
- **Rule:** any new record type must be added to the forget cascade, the export and the retention policy in the same change.

## 7. Confirmation (`src/privacy/confirm.ts`)

- Destructive tools always **plan → confirm → execute**.
- `forget_item` needs an explicit yes; `forget_household` needs a two-word spoken code.
- Confirmations are stored with `CONFIRM_TTL_SEC` (120 s) on the **wall** clock and carry the plan hash. If the plan changed between asking and confirming, Ellie asks again instead of deleting more than it described.

## 8. Retention (`src/privacy/retention.ts`)

`OUTBOX_RETENTION_DAYS` (30), `CHAT_RETENTION_DAYS` (7), `AUDIT_RETENTION_DAYS` (365), diagnosis sessions 24 h, short links at link expiry, translation cache 7 days. The TTL clock for each key is chosen in `data/keys.ts`, never inside a storage adapter.

## 9. Tools

| Tool | Behaviour |
| --- | --- |
| `what_do_you_know` | Speaks a short inventory summary, offers to send the full list to the phone, offers to forget something |
| `forget_item` | Plans, asks one confirmation question, then deletes |
| `forget_household` | Plans, asks for a spoken two-word code, rejects a wrong code, then erases |
| `manage_consent` | `status`, `grant`, `withdraw`; contact storage needs explicit confirmation |

All four return `toolResponse(EllieResult)` through `withTiming`, speak at most two short sentences, and ask at most one follow-up.

## 10. Phone privacy page

`packages/phone/src/pages/PrivacyPage.tsx` shows the inventory and offers export, forget-an-item, withdraw-consent and type-`erase`-to-erase. New token-scoped routes in `http/phoneApi.ts`. **Privacy views, export and erase require a privacy-kind link token.**

## 11. Optional OAuth 2.1 resource protection

Off by default; everything must still run with an empty `.env`.

- `src/auth/oauth.ts`, `metadata.ts`, `identity.ts`, `householdFromToken.ts`.
- RFC 9728 protected-resource metadata; a `401` challenge for a missing token; JWKS validation via `OAUTH_JWKS_URL`; required scopes via `OAUTH_REQUIRED_SCOPES`.
- **With OAuth enabled the household comes from the token**; a differing `householdId` argument is rejected.
- `scripts/dev-token.ts` mints a local development token. Ellie never issues tokens and never forwards them to AWS.

## 12. Documentation and config

- `docs/PRIVACY.md`: what is stored, who receives what per active driver, retention table, user controls, and the honest limits (AWS-side SNS/CloudWatch logs and PITR backups cannot be deleted by Ellie).
- `.env.example`: `OUTBOX_RETENTION_DAYS`, `CHAT_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `CONFIRM_TTL_SEC`, `OAUTH_JWKS_URL`, `OAUTH_HOUSEHOLD_CLAIM`, `OAUTH_REQUIRED_SCOPES`, `DEV_OAUTH_PRIVATE_KEY`.
- Add the "Privacy rules (Module 9+)" section to `.github/copilot-instructions.md`.
- Update `README.md`, `docs/modules.md` and `docs/friction-log.md`.

## 13. Tests delivered

`privacy.redact`, `privacy.consent`, `privacy.inventory`, `privacy.export`, `privacy.forget`, `privacy.retention`, `privacy.phone`, `privacy.audit`, `oauth`, `journey6.privacy.integration` (server); `PrivacyPage` (phone); `privacy` and extended `contracts` (schema); plus deterministic-router cases for forget/consent phrasing.

The privacy audit test is the backstop: seeded contacts and signed link tokens must not appear in logs, mock LLM requests or tool output.

## 14. Definition of Done (as evidenced, not as originally specified)

- [x] Schema 1.7.0 privacy types and four tool contracts
- [x] Single redaction module wired into logs, tool results, LLM requests, outbox and errors
- [x] `canSend()` is the only consent decision
- [x] Inventory and JSON export with masked contacts
- [x] Full forget cascade with receipts and a counts-only erase audit
- [x] Plan → confirm → execute for both destructive tools
- [x] Retention policy with explicit TTL clocks
- [x] Phone privacy page behind a privacy-kind token
- [x] Optional OAuth 2.1 resource protection, off by default
- [x] `PRIVACY.md`, `.env.example`, Copilot rules, README and roadmap updated
- [x] All tests green at the time: 204 total
- [x] Committed as `086e048`, follow-ups as `c417b79`; no amends

### Known gaps recorded later

- The redactor's phone-candidate pattern was too broad. It swallowed spoken dates and counts, and it corrupted destructive confirmation ids whose UUID began with eight digits — the proven cause of the privacy Journey 6 full-run flake. Fixed in Module 12 (`e0752c3`, `48b276e`).
- The live OAuth loopback check is recorded in `docs/friction-log.md` and `c417b79`. It is not proof of authorization-code/PKCE conformance with a real host; that review belongs to Module 12 Phase B4.
