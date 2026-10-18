import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetScheduleGroupCommand, SchedulerClient } from "@aws-sdk/client-scheduler";
import { GetTopicAttributesCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { loadEnv } from "../packages/server/src/config/env.js";
import { probeAwsCredentials } from "../packages/server/src/config/awsCredentials.js";
import { AWS_CHECK_SERVICES, diagnose, formatAwsReport, parseOnly, selectServices, type AwsCheckRow } from "./aws-check-lib.js";

const env = loadEnv();
const results: AwsCheckRow[] = [];
const bedrockOptIn = process.argv.includes("--bedrock");
const { services: selected, unknown } = selectServices(parseOnly(process.argv));
if (unknown) {
  console.error(`Unknown --only value "${unknown}". Choose one of: ${AWS_CHECK_SERVICES.join(", ")}.`);
  process.exit(2);
}
const credentialsAvailable = Boolean(env.AWS_PROFILE || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)) || await probeAwsCredentials();

async function check(service: string, required: string[], operation?: () => Promise<void>, needsCredentials = true): Promise<void> {
  if (!selected.includes(service)) return;
  const missing = required.filter((key) => !env[key as keyof typeof env]);
  if (missing.length) { results.push({ service, result: "SKIPPED", detail: `Missing ${missing.join(", ")}` }); return; }
  if (needsCredentials && !credentialsAvailable) { results.push({ service, result: "SKIPPED", detail: "No AWS credentials found by SDK chain" }); return; }
  try {
    await operation?.();
    results.push({ service, result: "PASS", detail: "Read-only check succeeded" });
  } catch (error) {
    const name = (error as { name?: string }).name;
    results.push({ service, result: "FAIL", detail: name ?? "AWS error", ...diagnose(name) });
  }
}

await check("DynamoDB", ["AWS_REGION", "DYNAMODB_TABLE_NAME"], async () => {
  const client = new DynamoDBClient({ region: env.AWS_REGION, ...(env.DYNAMODB_ENDPOINT ? { endpoint: env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}) });
  try { await client.send(new DescribeTableCommand({ TableName: env.DYNAMODB_TABLE_NAME })); } finally { client.destroy(); }
}, !env.DYNAMODB_ENDPOINT);
if (selected.includes("Bedrock") && !bedrockOptIn) results.push({ service: "Bedrock", result: "SKIPPED", detail: "Pass --bedrock to make a billable 5-token Converse ping" });
else await check("Bedrock", ["AWS_REGION", "BEDROCK_MODEL_ID"], async () => {
  const client = new BedrockRuntimeClient({ region: env.AWS_REGION, maxAttempts: 1 });
  try { await client.send(new ConverseCommand({ modelId: env.BEDROCK_MODEL_ID, messages: [{ role: "user", content: [{ text: "ping" }] }], inferenceConfig: { maxTokens: 5 } })); } finally { client.destroy(); }
});
await check("SNS", ["AWS_REGION", "SNS_TOPIC_ARN"], async () => {
  const client = new SNSClient({ region: env.AWS_REGION });
  try { await client.send(new GetTopicAttributesCommand({ TopicArn: env.SNS_TOPIC_ARN })); } finally { client.destroy(); }
});
await check("EventBridge Scheduler", ["AWS_REGION", "EVENTBRIDGE_SCHEDULE_GROUP"], async () => {
  const client = new SchedulerClient({ region: env.AWS_REGION });
  try { await client.send(new GetScheduleGroupCommand({ Name: env.EVENTBRIDGE_SCHEDULE_GROUP })); } finally { client.destroy(); }
});
await check("SQS", ["AWS_REGION", "SCHEDULER_QUEUE_URL"], async () => {
  const client = new SQSClient({ region: env.AWS_REGION });
  try { await client.send(new GetQueueAttributesCommand({ QueueUrl: env.SCHEDULER_QUEUE_URL, AttributeNames: ["ApproximateNumberOfMessages"] })); } finally { client.destroy(); }
});

console.log(formatAwsReport(results));
if (results.some((row) => row.result === "FAIL")) process.exitCode = 1;
