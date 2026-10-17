import { spawnSync } from "node:child_process";
import { loadEnv } from "../packages/server/src/config/env.js";

const env = loadEnv();
const yes = process.argv.includes("--yes");
const alertEmailArg = process.argv.indexOf("--alert-email");
const alertEmail = alertEmailArg >= 0 ? process.argv[alertEmailArg + 1] : undefined;
const regionArg = process.argv.indexOf("--region");
const region = regionArg >= 0 ? process.argv[regionArg + 1] : env.AWS_REGION;
if (!region) throw new Error("Set AWS_REGION or pass --region.");
const commands: string[][] = [
  ["cloudformation", "deploy", "--template-file", "infra/dynamodb-table.yaml", "--stack-name", "ellie-dynamodb", "--parameter-overrides", `TableName=${env.DYNAMODB_TABLE_NAME ?? "ellie-main"}`, "--region", region],
  ["cloudformation", "deploy", "--template-file", "infra/ellie-messaging.yaml", "--stack-name", "ellie-messaging", "--capabilities", "CAPABILITY_NAMED_IAM", "--parameter-overrides", `AlertEmail=${alertEmail ?? ""}`, "--region", region],
];
for (const args of commands) console.log(`aws ${args.join(" ")}`);
if (!yes) { console.log("Dry run only. Re-run with --yes to execute these commands."); process.exit(0); }
for (const args of commands) {
  const result = spawnSync("aws", args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AWS CLI deployment failed with exit code ${result.status ?? "unknown"}.`);
}
