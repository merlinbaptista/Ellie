import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const files = ["infra/iam-policy-dynamodb.json", "infra/iam-policy-bedrock.json", "infra/iam-policy-messaging.json"];
const policies = await Promise.all(files.map(async (file) => JSON.parse(await readFile(resolve(file), "utf8")) as { Version?: string; Statement?: unknown[] }));
const merged = { Version: "2012-10-17", Statement: policies.flatMap((policy) => policy.Statement ?? []) };
const output = resolve("infra/iam-policy-all.json");
await writeFile(output, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Wrote ${output}; replace any REPLACE_WITH_* placeholders before attaching the policy.`);
