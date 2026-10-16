import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.ELLIE_MCP_URL ?? "http://127.0.0.1:8787/mcp");
const client = new Client({ name: "ellie-smoke", version: "0.1.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  console.log("Tools:", tools.tools.map((tool) => tool.name).join(", "));
  const required = ["ellie_ping", "ellie_status", "ellie_region_info", "setup_household", "log_event", "get_history", "predict_next", "due_this_week", "diagnose", "log_resolution", "send_to_phone", "ellie_dev_time_travel"];
  for (const name of required) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`Missing tool: ${name}`);
  }
  const ping = await client.callTool({ name: "ellie_ping", arguments: { name: "Merlin" } });
  if (ping.isError) throw new Error("ellie_ping returned an error");
  console.log(JSON.stringify(ping, null, 2));
  const status = await client.callTool({ name: "ellie_status", arguments: {} });
  if (status.isError) throw new Error("ellie_status returned an error");
  console.log(JSON.stringify(status.structuredContent, null, 2));
  const region = await client.callTool({ name: "ellie_region_info", arguments: { country: "IN", item: "gas" } });
  if (region.isError || !region.content[0]?.text.toLowerCase().includes("cylinder") || !region.content[0]?.text.includes("25")) {
    throw new Error("ellie_region_info returned an unexpected result");
  }
  console.log("Region:", region.content[0].text);
  const resources = await client.listResources();
  if (!resources.resources.some((resource) => resource.uri === "ellie://region-packs")) {
    throw new Error("Missing ellie://region-packs resource");
  }
  const regionPack = await client.readResource({ uri: "ellie://region-packs/IN" });
  const pack = JSON.parse(String(regionPack.contents[0]?.text ?? "{}")) as { packId?: string };
  if (pack.packId !== "IN") throw new Error("India region pack resource is invalid");
  console.log("Resources: ellie://region-packs, ellie://region-packs/IN");
  const history = await client.callTool({ name: "get_history", arguments: { householdId: "demo-blr", item: "gas" } });
  if (history.isError) throw new Error("get_history returned an error");
  console.log("Memory:", history.content[0]?.text ?? "");
  const prediction = await client.callTool({ name: "predict_next", arguments: { householdId: "demo-blr", item: "gas" } });
  if (prediction.isError) throw new Error("predict_next returned an error");
  console.log("Prediction:", prediction.content[0]?.text ?? "");
  const due = await client.callTool({ name: "due_this_week", arguments: { householdId: "demo-blr" } });
  if (due.isError) throw new Error("due_this_week returned an error");
  console.log("Due:", due.content[0]?.text ?? "");
  const handoff = await client.callTool({ name: "send_to_phone", arguments: { householdId: "demo-blr", contentType: "summary" } });
  if (handoff.isError) throw new Error("send_to_phone returned an error");
  const handoffData = handoff.structuredContent?.data as { shortUrl?: string } | undefined;
  if (!handoffData?.shortUrl) throw new Error("send_to_phone did not return a short URL");
  const mcpOrigin = new URL(url).origin;
  const linkUrl = new URL(handoffData.shortUrl);
  linkUrl.host = mcpOrigin.replace(/^https?:\/\//, "");
  const phonePage = await fetch(linkUrl, { redirect: "follow" });
  if (phonePage.status !== 200 || !(await phonePage.text()).includes("This week")) throw new Error("Phone summary link did not open the expected page");
  console.log("Phone page:", phonePage.status, linkUrl.pathname);
} finally {
  await client.close();
}
