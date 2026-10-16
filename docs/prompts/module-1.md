# Ellie Module 1: Foundation & MCP Server Skeleton

This document records the implementation scope for Module 1. The original full specification was supplied in the project kickoff conversation; this workspace copy is a concise execution checklist.

## Constraints

- Node.js 20+ (Node 22 LTS recommended), TypeScript 5, ESM, NodeNext, npm workspaces.
- MCP TypeScript SDK v1 over stateful Streamable HTTP; do not use the v2 server package.
- Express 5, Zod 3, dotenv, Pino, Vitest, ESLint, and Prettier.
- Every external service has a functional mock. No real AWS SDK calls in Module 1.
- Use `ctx.clock.now()` for application time; log each tool duration and warn above 500 ms.

## Scope

Create the monorepo configuration, validated environment and driver switches, system/fake clock, error types, storage/LLM/notifier/scheduler interfaces and mocks, app context, `ellie_ping` and `ellie_status`, MCP session transport, HTTP health/status/outbox/dev-clock routes, smoke client, tests, documentation, and VS Code setup.

Do not create schema, phone, or simulator packages, future product tools, real AWS integrations, OAuth, or frontend applications in this module.

## Verification

```powershell
npm install
Copy-Item .env.example .env
npm run typecheck
npm test
npm run build
npm run dev
npm run smoke
```

The MCP endpoint is `http://127.0.0.1:8787/mcp`. The first module's AWS-ready services still use mocks and emit a warning until their adapters arrive in later modules.
