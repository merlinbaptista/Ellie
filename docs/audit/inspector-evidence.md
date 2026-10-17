# MCP Inspector evidence (Gate A item A-08)

Closes Gate A finding **A-08** ("Inspector UI not exercised"). The official MCP Inspector was run in **CLI mode** against a locally running Ellie server. This replaces the earlier SDK-client sweep, which was supporting evidence only.

## How this was produced

| Item | Value |
| --- | --- |
| Command | `npx @modelcontextprotocol/inspector --cli http://127.0.0.1:8787/mcp --transport http …` |
| Server | `npm start` (built `dist/`), spec 2025-11-25, Streamable HTTP, `POST /mcp` |
| Drivers | All four mock/file drivers; no AWS credentials present |
| Clock | `ELLIE_FAKE_NOW=2026-10-16T09:00:00+05:30` |
| Seed | `npm run seed:reset` before the sweep |
| Date | 2026-10-17 |
| Scope | `tools/list`, `resources/list`, and **one call of every registered tool** |

Destructive tools ran against a **disposable household** (`hh_insp-<unix-seconds>`), which was erased at the end of the sweep. No real contact detail, access token, short-link token or household id from the demo data is reproduced below. Spoken output is quoted verbatim; identifiers are shown only where they are synthetic and already deleted.

## `tools/list` — 16 tools

`ellie_ping`, `ellie_status`, `ellie_region_info`, `setup_household`, `log_event`, `get_history`, `predict_next`, `due_this_week`, `ellie_dev_time_travel`, `diagnose`, `log_resolution`, `send_to_phone`, `what_do_you_know`, `forget_item`, `forget_household`, `manage_consent`.

Every tool advertises a draft-07 `inputSchema`, a `title`, a `description` and MCP `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).

## `resources/list`

`ellie://region-packs` (list), `ui://ellie/card.html` (MCP Apps card), and one resource per pack: Default (DEFAULT), India (IN), United States (US), United Kingdom (UK).

## Tool calls — all 16 succeeded

| # | Tool | Arguments (abridged) | Spoken result |
| --- | --- | --- | --- |
| 1 | `ellie_ping` | `name=Inspector` | "Hi Inspector, Ellie is awake and remembering your home." |
| 2 | `ellie_status` | — | "All systems running. 4 services are on demo mode until AWS keys are added." |
| 3 | `ellie_region_info` | `country=IN item=gas` | "In India, a gas cylinder usually lasts about 40 days, and bookings open 25 days after the last one. Regional units are litres and Celsius." |
| 4 | `setup_household` | disposable id, `country=US`, `region=Inspector check` | "Where should I send fixes and reminders?" (one follow-up, as designed) |
| 5 | `log_event` | disposable id, `item=air filter`, `type=changed` | "Got it." |
| 6 | `get_history` | `demo-blr`, `item=gas` | "Your gas cylinder was changed 5 times this year, about every 38 days. The last one was Wednesday, 9 September." |
| 7 | `predict_next` | `demo-blr`, `item=gas` | "Your gas cylinder is due around Saturday, 17 October. Bookings open on Sunday, 4 October." |
| 8 | `due_this_week` | `demo-blr` | "The sediment filter is about 3 months overdue and the gas cylinder is due on Saturday, 17 October." |
| 9 | `ellie_dev_time_travel` | `to=2026-10-16` | "It's now 2026-10-16. 0 reminders were sent." |
| 10 | `diagnose` | `demo-blr`, `item=water purifier`, slow flow | "Most likely a filter may be overdue — sediment filter is about 3 months overdue. Warranty valid until Sunday, 20 December." |
| 11 | `diagnose` (safety) | `demo-blr`, `item=gas`, "I can smell gas in the kitchen" | "Close the cylinder regulator only if it is safe, don't touch switches, open windows, and call 1906." — no DIY steps returned |
| 12 | `log_resolution` | `demo-blr`, `item=water purifier`, `diagnosisId`, `byWhom=self` | "Thanks — I've noted Replace the sediment filter. I'll remind you around Wednesday, 14 April." |
| 13 | `send_to_phone` | `demo-blr`, `contentType=fix`, `diagnosisId` | "Sent the steps to your phone ending 0001." |
| 14 | `what_do_you_know` | `demo-blr` | "I'm tracking 4 things — AC, inverter, gas cylinder, water purifier, with 18 events since 2026-03…" |
| 15 | `manage_consent` | `demo-blr`, `action=status` | "I can send messages ending 0001. You gave permission on 2026-08-18." |
| 16 | `forget_item` (plan) | disposable id, `item=air filter` | "I'll prepare that deletion for your confirmation." |
| 17 | `forget_item` (confirm) | plan `confirmationId` + `confirm=true` | "Done — I've forgotten the HVAC filter." |
| 18 | `forget_household` (plan) | disposable id | "This will erase everything I know about your home and can't be undone. To confirm, say: forget everything, quiet cedar." |
| 19 | `forget_household` (confirm) | plan `confirmationId` + spoken code | "Everything is erased. This household is now empty." |
| 20 | `what_do_you_know` (after erase) | disposable id | "I don't know anything about your home yet…" |

`isError` was false for every call. Twenty calls cover all sixteen tools; the extra four are the second half of each destructive two-step plus the post-erase check.

## What this sweep found

The first Inspector run (before the fix) printed:

```
PARSED erase confirmationId: [REDACTED_PHONE]-91ce-40b7-b257-bdc5ec2739ff
```

A UUID whose first segment happens to be all digits is an eight-digit run, so the log/response redactor replaced it inside `followUp.retry.args.confirmationId`. The returned id no longer resolved, and `forget_household` answered "That code didn't match". This is the proven root cause of the privacy Journey 6 full-run flake recorded as **A-01**; it is fixed in `48b276e` and covered by regression tests in `packages/server/test/privacy.redact.test.ts` and `packages/server/test/result.test.ts`. The run above is the post-fix repeat: the same flow now erases successfully.

## Limits

- CLI mode was used, not the Inspector web UI. The CLI exercises the same client transport and the same JSON-RPC methods.
- The server ran on `http://127.0.0.1:8787` with mock drivers. No AWS, no public HTTPS endpoint and no Alexa+ host were involved.
- Emergency numbers and interval facts quoted above come from region packs and remain subject to user source verification (`docs/pack-verification.md`).
