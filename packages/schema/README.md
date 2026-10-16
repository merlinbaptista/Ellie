# @ellie/schema

An open schema for household memory: home events, items, and region packs.

## Install

```sh
npm install @ellie/schema zod
```

## Quick example

```ts
import { HomeEvent, createBuiltInRegistry } from "@ellie/schema";

const event = HomeEvent.parse({
  schemaVersion: 1,
  eventId: "evt_change-001",
  householdId: "demo-blr",
  itemId: "itm_cylinder-001",
  type: "changed",
  timestamp: "2026-10-16T03:00:00.000Z",
  localDate: "2026-10-16",
  recordedAt: "2026-10-16T03:01:00.000Z",
  source: "voice",
});
const regions = createBuiltInRegistry();
const india = regions.forCountry("IN");
const matches = regions.matchItem("gas", india.packId);
```

## Region-pack format

| Field | Meaning |
|---|---|
| `packId`, `version`, `extends` | Stable pack identity, semantic data version, optional DEFAULT inheritance |
| `countries`, `locale`, `units` | Country mapping, language/time zone/date order, measurement and currency defaults |
| `seasons`, `vocabulary` | Seasonal ranges and region-specific terms |
| `catalog` | Items, aliases, recurring defaults, components, symptoms, safety metadata |
| `providers` | Booking or shopping destinations with applicability and provenance |
| `safety` | Emergency numbers and safety-stop messages for all safety categories |
| `sources` | Provenance for starter facts; unverified facts are surfaced by the registry |

Every regional fact should carry a source reference. Defaults are not advice and household history should take precedence.

## How to add a region

Copy `src/region-packs/default.json`, set a unique country `packId` and `countries`, then add locale, units, catalog, providers, and safety data. Keep all five safety stop messages and attach provenance to each interval or regional fact. Run `npm run validate:packs`, add tests for matching and merge behavior, and open a pull request.

## Data rules

Do not add personal household data, real household addresses, or private phone numbers. `verified: false` marks a hackathon starter default that must be checked before production use. Provider contacts in demo packs are placeholders, not endorsements.

## License

MIT. See [LICENSE](LICENSE).
