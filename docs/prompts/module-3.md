# Ellie — Module 3: Household Memory

## Scope

Module 3 adds household setup and event memory on top of `@ellie/schema` 1.1.0. It includes the AWS SDK v3 DynamoDB adapter with DynamoDB Local support, single-table repositories and key builders, ask-once follow-ups, item/event/history domain services, `setup_household`, `log_event`, and `get_history`, seeded Bengaluru/Texas demo households, and development memory APIs.

Do not add prediction tools, diagnosis/Bedrock, notifications/scheduling, phone handoff, frontend apps, privacy tools, or OAuth.

## Behavioral requirements

- Keep household IDs, items, events, dates, units, and region data aligned with `@ellie/schema`; schema source remains browser-safe.
- Build every DynamoDB partition/sort key in `packages/server/src/data/keys.ts` only.
- The empty-key path uses persistent file storage. When a table and AWS region/credentials are configured, storage automatically uses DynamoDB; `DYNAMODB_ENDPOINT` selects DynamoDB Local with local-only dummy credentials.
- Store phone numbers only with consent and mask them in output. Reject full street addresses.
- Ask at most one useful follow-up per turn, offer a default and retry hint, and never ask a field twice.
- Learn household item aliases. Resolve a fresh item through the selected region catalog, then fall back to a custom item.
- Hash event retry identity and enforce TTL in memory/file storage as well as DynamoDB reads.
- Seed demo dates from a local-date anchor; reset only the `demo-blr` and `demo-tx` partitions.

## Verification

```powershell
npm install
npm run build
npm run typecheck
npm test
npm run seed:reset
npm run lint
npm run dev
npm run smoke
```

Optional DynamoDB Local verification: run `npm run db:local`, set `DYNAMODB_ENDPOINT=http://localhost:8000` and `DYNAMODB_TABLE_NAME=ellie-main`, then run `npm run db:create`, `npm run seed:reset`, and `DYNAMODB_TEST=true npm test`.