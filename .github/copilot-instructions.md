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
