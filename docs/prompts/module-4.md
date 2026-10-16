# Ellie — Module 4: Prediction Engine

## Goal

Module 4 adds a pure, history-first prediction engine, regional rule application, component-level predictions, confidence/explanations, persisted prediction snapshots, deterministic local reminders, `predict_next`, `due_this_week`, and development time travel. It updates `@ellie/schema` to 1.2.0 with event components, component aliases, expanded Prediction data, and tool contracts.

## Constraints

- Everything under `packages/server/src/prediction/` is pure. Do not import storage, logger, process, or `Date.now()`; receive local today and computed timestamp as inputs.
- Household event history takes priority over region defaults. Keep the rule pipeline explicit and record applied rules in prediction data.
- Compute status live from local dates, not a persisted status. Components are predicted only after tagged component history exists.
- Reminder IDs must be deterministic and upserted. Cancel item reminders on booking, cancel delivery checks on delivery/change, and recheck history before sending a fired reminder.
- Keep the DynamoDB Local dependency optional and maintain the Module 1–3 behavior.

## Verification

```powershell
npm install
npm run gen:jsonschema
npm run validate:packs
npm run build
npm run typecheck
npm run lint
npm test
$env:SEED_ANCHOR_DATE="2026-10-16"; npm run seed:reset
npm run dev
npm run smoke
```

For the demo rehearsal, seed at 2026-10-16, call `due_this_week`, log the live gas-cylinder change, call `predict_next`, then use `ellie_dev_time_travel` to move to 2026-11-18 and inspect the fake phone outbox. The specific AC example in the source prompt conflicts with its preferred-month rule; follow the explicit rules and retain the discrepancy in `docs/friction-log.md`.
