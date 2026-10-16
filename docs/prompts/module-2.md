# Ellie — Module 2: Home-Event Schema & Region Packs

## Goal

Module 2 adds the standalone, browser-safe `@ellie/schema` package and wires its region registry into the server. The package defines strict Zod entities (Household, Item, HomeEvent, Prediction, Resolution), shared tool contracts, DEFAULT/IN/US/UK region packs, provenance rules, and pure matching/date/unit/formatting/ID helpers. Runtime dependencies are limited to Zod.

## Scope

Build the schema package, its tests and 90%+ line coverage, generated RegionPack JSON Schema, pack validator CLI, server registry with optional extra JSON packs, `ellie_region_info`, MCP resources for listing/reading packs, and documentation. Do not add persistence/product workflows, prediction or diagnosis engines, phone handoff, AWS calls, or frontend apps.

Regional data must remain in JSON packs, carry source notes, and be treated as starter defaults unless verified. Preserve the specified India LPG defaults (40-day interval, 25-day booking gap, Indane WhatsApp `REFILL`, emergency gas number 1906) and US gallons/Fahrenheit/propane wording. Schema source must not use Node-only APIs or depend on the server.

## Verification

```powershell
npm install
npm run gen:jsonschema
npm run validate:packs
npm run typecheck
npm test
npm run build
npm run lint
npm run dev
npm run smoke
```

Confirm MCP tools include `ellie_region_info`, resources include `ellie://region-packs`, and `ellie://region-packs/IN` is valid RegionPack JSON. Commit with `Module 2: home-event schema and region packs` after verification.
