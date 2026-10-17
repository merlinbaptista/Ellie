import { spawnSync } from "node:child_process";
import { loadEnv } from "../packages/server/src/config/env.js";

const env = loadEnv();
const yes = process.argv.includes("--yes");
const region = env.AWS_REGION;
if (!region) throw new Error("Set AWS_REGION before deleting AWS stacks.");
const commands = ["ellie-messaging", "ellie-dynamodb"].map((stack) => ["cloudformation", "delete-stack", "--stack-name", stack, "--region", region]);
for (const args of commands) console.log(`aws ${args.join(" ")}`);
if (!yes) { console.log("Dry run only. Re-run with --yes to delete these stacks."); process.exit(0); }
for (const args of commands) {
  const result = spawnSync("aws", args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AWS CLI deletion failed with exit code ${result.status ?? "unknown"}.`);
}
