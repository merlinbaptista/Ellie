# Friction log

| Date | Task | Steps taken | Expected | Actual | Severity (Low/Med/High) | Workaround | Suggestion |
|---|---|---|---|---|---|---|---|
| 2026-10-16 | Set up MCP server over Streamable HTTP | | | | | | |
| 2026-10-16 | Build schema inheritance and JSON Schema | Generated schema from Zod; merged DEFAULT with country packs; exercised NodeNext JSON imports | Child entries should merge without changing shape | A merge branch initially inserted the full regional catalog at each new key; pack CLI caught it before server integration | Low | Fixed entry assignment and reran pack validation | Keep merge and registry validation in the schema package tests |
