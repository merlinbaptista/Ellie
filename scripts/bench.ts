import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eraseThrowawayHousehold, percentile } from "./bench-lib.js";

const endpoint = new URL(process.env.ELLIE_BENCH_URL ?? "http://127.0.0.1:8787/mcp");
const base = endpoint.origin;
const householdId = `hh_bench-${randomUUID().slice(0, 8)}`;
const iterations = 30;
const warmups = 3;
const client = new Client({ name: "ellie-bench", version: "1.0.0" });
const cases: Array<{ name: string; args: (index: number) => Record<string, unknown> }> = [
  { name: "due_this_week", args: () => ({ householdId: "demo-blr" }) },
  { name: "predict_next", args: () => ({ householdId: "demo-blr", item: "gas" }) },
  { name: "get_history", args: () => ({ householdId: "demo-blr", item: "gas" }) },
  { name: "log_event", args: (index) => ({ householdId, item: "bench appliance", type: "note", notes: `bench event ${index}` }) },
  { name: "diagnose", args: () => ({ householdId, item: "water purifier", symptom: "beeping" }) },
  { name: "send_to_phone", args: () => ({ householdId, contentType: "summary" }) },
  { name: "what_do_you_know", args: () => ({ householdId: "demo-blr" }) },
];
interface BenchRow { tool: string; p50: number; p95: number; max: number; status: string }
const results: BenchRow[] = [];
let sessionReady = false;

async function call(name: string, args: Record<string, unknown>): Promise<void> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} returned an MCP error.`);
}
async function eraseBenchHousehold(): Promise<void> {
  if (!sessionReady) return;
  await eraseThrowawayHousehold(householdId, async (name, args) => client.callTool({ name, arguments: args }));
  sessionReady = false;
}

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const status = await fetch(new URL("/api/status", base)).then((response) => response.json()) as { drivers?: Record<string, { implementation?: string; resolved?: string }> };
  const initialized = await client.callTool({ name: "setup_household", arguments: { householdId, country: "IN", region: "Bench", timeZone: "Asia/Kolkata", consent: false, confirm: true } });
  if (initialized.isError) throw new Error("Could not initialize throwaway benchmark household.");
  sessionReady = true;
  const resultsPath = resolve("docs/bench.md");
  for (const test of cases) {
    const times: number[] = [];
    for (let index = 0; index < warmups + iterations; index++) {
      const args = test.args(index);
      const start = performance.now();
      await call(test.name, args);
      const elapsed = performance.now() - start;
      if (index >= warmups) times.push(elapsed);
    }
    const p50 = Math.round(percentile(times, 50));
    const p95 = Math.round(percentile(times, 95));
    const max = Math.round(Math.max(...times));
    results.push({ tool: test.name, p50, p95, max, status: p95 <= 500 ? "PASS" : "FAIL" });
  }
  const lines = [
    "# Benchmark",
    "",
    `Date: ${new Date().toISOString()}`,
    `Endpoint: ${endpoint.origin}`,
    `Storage: ${status.drivers?.storage?.implementation ?? "unknown"}`,
    `LLM: ${status.drivers?.llm?.implementation ?? "unknown"}`,
    `Samples per tool: ${iterations} after ${warmups} warm-ups` ,
    "",
    "| Tool | p50 (ms) | p95 (ms) | max (ms) | Result |",
    "|---|---:|---:|---:|---|",
    ...results.map((row) => `| ${row.tool} | ${row.p50} | ${row.p95} | ${row.max} | ${row.status} |`),
    "",
  ];
  await mkdir(resolve("docs"), { recursive: true });
  await writeFile(resultsPath, lines.join("\n"));
  console.table(results);
  if (results.some((row) => row.status === "FAIL")) process.exitCode = 1;
} finally {
  try { await eraseBenchHousehold(); }
  finally { await client.close(); }
}
