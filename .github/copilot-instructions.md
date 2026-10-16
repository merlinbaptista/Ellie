# Ellie — Copilot project rules

## Product
Ellie is a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) that turns Alexa+ into a household memory agent:
it logs home events by voice, predicts next due dates using household history + region packs, diagnoses problems
from history, and hands fixes/bookings to the phone.

## Non-negotiables
- MCP SDK: `@modelcontextprotocol/sdk` v1 only. Never install `@modelcontextprotocol/server` (v2).
- ESM + NodeNext: relative imports end in `.js`.
- Every tool returns `toolResponse(EllieResult)` from `src/mcp/result.ts` and is wrapped in `withTiming`.
- `speech` is ≤ 2 short sentences, plain text, voice friendly. Visuals go in `card`; long content goes to the phone.
- Ask at most ONE follow-up question per turn via `followUp`; never ask for data already stored; offer a default.
- Time: always `ctx.clock.now()`. Store UTC ISO strings; compute local dates in the household's IANA time zone.
- External services only through adapters in `src/adapters/*`. Every adapter has a working mock. AWS is chosen by
  `src/config/drivers.ts` when keys exist in `.env`. Code must run with an empty `.env`.
- Facts (dates, overdue, warranty, rules) are computed in code. The LLM only ranks/explains and must cite history IDs.
- Safety: gas smell, electrical faults, water near power → no DIY steps; say switch off, call a professional,
  give the region emergency number.
- Privacy: never store a full address; phone stored only with consent; mask phones in logs.
- Keep tool latency under 500 ms on the mock path.
- Add/extend vitest tests for every new module. `npm test` and `npm run typecheck` must pass before finishing.
- Log developer friction in `docs/friction-log.md` when something is confusing or slow.

## Schema rules (Module 2+)
- All domain types come from `@ellie/schema`. Never redefine Household/Item/Event/Prediction/Resolution in the server.
- `@ellie/schema/src` must stay browser-safe: no fs, path, process, Buffer.
- Regional facts live only in region-pack JSON with a `source`. Never hard-code intervals, phone numbers or rules in server code.
- Use `registry.vocabulary()` and pack units for any user-facing wording.
- Dates: use `@ellie/schema` date helpers; store UTC, compute in household time zone.

## Memory rules (Module 3+)
- DynamoDB keys are built ONLY in `src/data/keys.ts`. Tools never touch storage directly: tools → domain → repositories → `StorageAdapter`.
- Follow-ups go through `domain/followups.ts`: one per turn, max two per task, never re-ask (`askedFields`), always offer a default, include `retry`.
- Item resolution order: id/catalogKey → household alias → existing items → region catalog → custom item. Learn aliases.
- Seed data uses day offsets from an anchor; never hard-code “today”.
- Phone numbers are stored only with consent and masked in responses and logs.

## Prediction rules (Module 4+)
- `src/prediction/*` is pure: no storage, clock, logger or `Date.now()`. Pass `todayLocal` and `computedAt` in.
- Household history beats region defaults. Region rules (lead time, buffer, minimum booking gap, preferred months) come only from region packs and are recorded in `rulesApplied` with a human description.
- Status is computed live from stored dates and today's local date; never trust a stored status.
- Never predict or remind for components with no history.
- Reminder jobs have deterministic IDs and are upserted; the fire handler rechecks for staleness before sending.
- Speak at most one prediction sentence per tool response.

## Diagnosis rules (Module 5+)
- Safety classification runs before item creation, follow-up questions, DIY guidance, or LLM calls. Safety-stop responses must not contain fix steps.
- Diagnosis evidence and candidate scores are deterministic; the LLM may only rank provided cause keys and explain provided evidence IDs.
- Reject invented causes, invalid or missing citations, uncited factual dates/numbers, and unsafe or low-confidence rankings; use deterministic speech instead.
- Never send household IDs, contact details, region, or household-specific item names to Bedrock. Use the region catalog display name.
- Keep diagnosis sessions for the configured TTL and ask only a question whose answer can change the leading cause.
- Fix plans and regional safety facts belong in region-pack JSON with a `source`; never add repair intervals or emergency numbers in server logic.
- Record confirmed fixes through `log_resolution`; component changes or service events must trigger live prediction recomputation.
