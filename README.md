# Ellie

Normal reminders remember a time. Ellie remembers your home.

**Status: Module 1: foundation**

Ellie is a self-hosted MCP server that turns Alexa+ into a household memory agent. It records home events, predicts what is due from household history and region packs, diagnoses problems, and hands fixes or bookings to a phone.

## Quick start

Requires Node.js 20 or newer (Node 22 LTS recommended).

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

In a second terminal:

```powershell
npm run smoke
```

## Connect with MCP Inspector

Run `npm run inspector`, choose **Streamable HTTP**, then connect to `http://127.0.0.1:8787/mcp`.

## Connect from VS Code Copilot

The server connection is configured in [.vscode/mcp.json](.vscode/mcp.json). Start Ellie with `npm run dev`, then use Copilot Agent mode.

## Demo mode vs AWS mode

Each service uses mock mode by default. With `auto`, AWS is selected only when all required values are configured. Module 1 still uses mocks for AWS-resolved services because real AWS adapters arrive in later modules.

| Service | AWS requirements | Mock implementation |
|---|---|---|
| storage | `AWS_REGION`, `DYNAMODB_TABLE_NAME`, credentials | file-store (or memory-store) |
| llm | `AWS_REGION`, `BEDROCK_MODEL_ID`, credentials | mock-llm |
| notifier | `AWS_REGION`, credentials, `SNS_TOPIC_ARN` or `SNS_SMS_ENABLED=true` | console-outbox |
| scheduler | `AWS_REGION`, `EVENTBRIDGE_TARGET_ARN`, `EVENTBRIDGE_ROLE_ARN`, credentials | local-timer |

Credentials are `AWS_PROFILE` or both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Project structure

- `packages/server`: TypeScript MCP server, adapters, HTTP API, tests
- `scripts`: end-to-end smoke client
- `docs`: module roadmap and development friction log
- `.vscode`: MCP server, launch, task, and editor configuration

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

## License

MIT. See [LICENSE](LICENSE).
