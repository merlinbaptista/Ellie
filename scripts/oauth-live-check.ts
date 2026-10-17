import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = process.env.ELLIE_OAUTH_TEST_TOKEN;
if (!token) throw new Error("ELLIE_OAUTH_TEST_TOKEN is required.");
const url = new URL(process.env.ELLIE_MCP_URL ?? "http://127.0.0.1:8787/mcp");
const client = new Client({ name: "ellie-oauth-live-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });

try {
  await client.connect(transport);
  const result = await client.callTool({ name: "get_history", arguments: { householdId: "demo-tx" } });
  const speech = (result.structuredContent as { speech?: string } | undefined)?.speech ?? result.content?.[0]?.text ?? "";
  console.log(speech);
  if (!speech.includes("I can only see your own home.")) process.exitCode = 1;
} finally {
  await client.close();
}