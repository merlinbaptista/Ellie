import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.ELLIE_MCP_URL ?? "http://127.0.0.1:8787/mcp");
const client = new Client({ name: "ellie-smoke", version: "0.1.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map((tool) => tool.name).join(", "));
  const required = ["ellie_ping", "ellie_status"];
  for (const name of required) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`Missing tool: ${name}`);
  }
  const ping = await client.callTool({ name: "ellie_ping", arguments: { name: "Merlin" } });
  if (ping.isError) throw new Error("ellie_ping returned an error");
  console.log(JSON.stringify(ping, null, 2));
  const status = await client.callTool({ name: "ellie_status", arguments: {} });
  if (status.isError) throw new Error("ellie_status returned an error");
  console.log(JSON.stringify(status.structuredContent, null, 2));
} finally {
  await client.close();
}
