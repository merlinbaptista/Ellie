# Module 5: Diagnosis Engine

## Goal

Use household history to diagnose reported home problems, while keeping safety decisions, evidence, candidate scoring, fix plans, and factual statements deterministic and source-backed.

## Contracts and storage

- Bump `@ellie/schema` to 1.3.0 and add browser-safe `Evidence`, `Candidate`, `Diagnosis`, and `FixPlan` schemas.
- Store diagnosis sessions with the configured TTL and stable diagnosis IDs. Store confirmed resolutions with cause, component, fix, actor, date, optional cost, and supporting event IDs.
- Build all diagnosis and resolution storage keys in `src/data/keys.ts`; access storage through repositories only.

## Safety and diagnosis

- Evaluate keyword safety and pack-declared safety symptoms before resolving or creating an item, asking questions, producing fix steps, or calling an LLM.
- On a safety stop, return only the region stop message and emergency contact, log the symptom, and do not offer DIY steps or a follow-up. Electrical and water-near-power wording should say to switch off power only when that can be done safely.
- Build deterministic evidence from symptom history, component predictions, prior resolutions, recent service, warranty, answers, and no-history state.
- Score only pack-declared likely causes. Preserve pack order on equal scores. Ask at most one question only when its answer can change the leading cause; do not ask more than twice or repeat a household's asked field.
- Build DIY and professional fix plans exclusively from region-pack metadata. A safety symptom cannot produce DIY steps.

## LLM policy

- The Bedrock Converse adapter uses the AWS SDK default credential chain, optional guardrails, bounded retries/timeouts, and structured safe errors.
- Provide only a generic catalog display name, canonical symptom key, base language, candidates, and evidence ID/text to the model. Never include household IDs, address/contact data, region, arbitrary spoken text, or user-defined item names. Prior resolution evidence uses pack-owned descriptions, not free-text fix notes.
- The model may reorder provided cause keys and explain provided evidence. Validate JSON, candidate keys, citations, uncited numbers/dates, sentence count, and score veto before accepting the result.
- Return deterministic evidence-backed speech on invalid output or the 350 ms voice deadline. If voice times out, abort that request and start one separately bounded background refinement that can update the saved explanation.

## Resolution lifecycle

- `log_resolution` records the confirmed cause/fix, logs component change/service and cost events when applicable, closes the diagnosis session, and recomputes predictions.
- Deduplicate repeated resolution submissions for the same item/cause/date.
- Seed a prior Bengaluru purifier resolution without adding new demo-Texas symptom events.

## Verification

Add unit tests for safety, evidence, scoring, question selection, citation validation, timeouts, Bedrock Converse mapping, and resolution lifecycle. Add an MCP integration journey covering seeded diagnosis, cited evidence/fix plan, resolution and prediction, and a safety stop. Validate region packs, generated schema, typecheck, all tests, build, and MCP smoke output.
