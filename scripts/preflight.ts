import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadEnv } from "../packages/server/src/config/env.js";
import { resolveDrivers } from "../packages/server/src/config/drivers.js";
import { staticPreflight, summarizePreflight } from "./preflight-lib.js";

const env = loadEnv();
const drivers = await resolveDrivers(env);
const checks = staticPreflight({
  NODE_ENV: env.NODE_ENV,
  LINK_SIGNING_SECRET: env.LINK_SIGNING_SECRET,
  ELLIE_PUBLIC_BASE_URL: env.ELLIE_PUBLIC_BASE_URL,
  HOST: env.HOST,
  SIMULATOR_ENABLED: env.SIMULATOR_ENABLED,
  ...(env.SIM_ACCESS_CODE ? { SIM_ACCESS_CODE: env.SIM_ACCESS_CODE } : {}),
  CORS_ORIGINS: env.CORS_ORIGINS,
  ...(env.ELLIE_FAKE_NOW ? { ELLIE_FAKE_NOW: env.ELLIE_FAKE_NOW } : {}),
  OAUTH_ENABLED: env.OAUTH_ENABLED,
  ...(process.env.ELLIE_DOCKER ? { ELLIE_DOCKER: process.env.ELLIE_DOCKER } : {}),
  STORAGE_DRIVER: drivers.storage.resolved,
  LLM_DRIVER: drivers.llm.resolved,
  NOTIFY_DRIVER: drivers.notifier.resolved,
  SCHEDULER_DRIVER: drivers.scheduler.resolved,
});

if (env.NODE_ENV === "production") {
  const origin = new URL(env.ELLIE_PUBLIC_BASE_URL).origin;
  for (const [label, path, method, body] of [
    ["Development seed route", "/api/dev/seed", "POST", { reset: true }],
    ["Development time-travel route", "/api/dev/time-travel", "POST", { reset: true }],
  ] as const) {
    try {
      const response = await fetch(new URL(path, origin), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(2500) });
      checks.push({ status: response.status === 404 ? "PASS" : "FAIL", label, detail: response.status === 404 ? "Returns 404" : `Expected 404; received HTTP ${response.status}` });
    } catch {
      checks.push({ status: "FAIL", label, detail: "Could not reach the configured public URL to verify the production gate" });
    }
  }
  if (!env.OAUTH_ENABLED) {
    const client = new Client({ name: "ellie-preflight", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
      const tools = await client.listTools();
      const exposed = tools.tools.some((tool) => tool.name === "ellie_dev_time_travel");
      checks.push({ status: exposed ? "FAIL" : "PASS", label: "Development MCP tool", detail: exposed ? "ellie_dev_time_travel is exposed" : "ellie_dev_time_travel is not registered" });
    } catch {
      checks.push({ status: "FAIL", label: "Development MCP tool", detail: "Could not connect to MCP to verify tool registration" });
    } finally { await client.close().catch(() => undefined); }
  } else checks.push({ status: "WARN", label: "Development MCP tool", detail: "OAuth is enabled; unauthenticated tool-list check was skipped" });
}

for (const check of checks) console.log(`${check.status.padEnd(4)} ${check.label}: ${check.detail}`);
const summary = summarizePreflight(checks);
console.log(`Preflight: ${summary.failures} failure(s), ${summary.warnings} warning(s).`);
if (!summary.passed) process.exitCode = 1;
