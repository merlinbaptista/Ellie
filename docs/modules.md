# Module roadmap

| # | Module | Delivers | Status |
|---|---|---|---|
| 1 | Foundation & MCP skeleton | Monorepo, config, driver switch, adapter interfaces + mocks, MCP Streamable HTTP server, ping/status, tests, VS Code setup | ✅ |
| 2 | Home-event schema & region packs | `@ellie/schema`: Zod types and IN/US/UK/default packs | ✅ |
| 3 | Household memory | Repositories, DynamoDB adapter, household/event tools, Bengaluru + Texas seed data | ✅ |
| 4 | Prediction engine | Due dates, time-zone maths, regional minimums, confidence, reminders | ✅ |
| 5 | Diagnosis engine | Symptom flows, safety rules, Bedrock adapter, diagnosis/resolution tools | ✅ |
| 6 | Phone handoff & scheduling | SNS, EventBridge Scheduler, booking links, signed phone links | ⏳ |
| 7 | Phone fix page | Mobile page, steps, chat, booking, MCP Apps view | ⏳ |
| 8 | Simulated Alexa+ web app | Browser voice, multi-intent, Echo Show cards, household switcher | ⏳ |
| 9 | Privacy & trust | Knowledge and forget tools, consent, optional OAuth 2.1 + PKCE | ⏳ |
| 10 | Demo & submission | Demo runner, time-travel scenarios, docs, schema extraction, Docker | ⏳ |

Module 3 note: DynamoDB Local contract suite is available but was not run in the build environment because Docker is unavailable.
