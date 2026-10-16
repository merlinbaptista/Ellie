import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetScheduleGroupCommand, SchedulerClient } from "@aws-sdk/client-scheduler";
import { GetTopicAttributesCommand, SNSClient } from "@aws-sdk/client-sns";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { loadEnv } from "../packages/server/src/config/env.js";
import { probeAwsCredentials } from "../packages/server/src/config/awsCredentials.js";

type Result = { service: string; result: "ok" | "failed" | "skipped"; detail: string };
const env = loadEnv();
const results: Result[] = [];
const bedrockOptIn = process.argv.includes("--bedrock");
const credentialsAvailable = Boolean(env.AWS_PROFILE || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)) || await probeAwsCredentials();

async function check(service: string, required: string[], operation?: () => Promise<void>, needsCredentials = true): Promise<void> {
  const missing = required.filter((key) => !env[key as keyof typeof env]);
  if (missing.length) { results.push({ service, result: "skipped", detail: `Missing ${missing.join(", ")}` }); return; }
  if (needsCredentials && !credentialsAvailable) { results.push({ service, result: "skipped", detail: "No AWS credentials found by SDK chain" }); return; }
  try {
    await operation?.();
    results.push({ service, result: "ok", detail: "Read-only check succeeded" });
  } catch (error) {
    results.push({ service, result: "failed", detail: (error as { name?: string }).name ?? "AWS error" });
  }
}

await check("DynamoDB", ["AWS_REGION", "DYNAMODB_TABLE_NAME"], async () => {
  const client = new DynamoDBClient({ region: env.AWS_REGION, ...(env.DYNAMODB_ENDPOINT ? { endpoint: env.DYNAMODB_ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}) });
  try { await client.send(new DescribeTableCommand({ TableName: env.DYNAMODB_TABLE_NAME })); } finally { client.destroy(); }
}, !env.DYNAMODB_ENDPOINT);
if (!bedrockOptIn) results.push({ service: "Bedrock", result: "skipped", detail: "Pass --bedrock to make a billable 5-token Converse ping" });
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

console.log("Service                 Result    Detail");
console.log("----------------------  --------  -----------------------------------------------");
for (const row of results) {
  const glyph = row.result === "ok" ? "✔" : row.result === "failed" ? "✖" : "-";
  console.log(`${row.service.padEnd(23)} ${glyph} ${row.result.padEnd(8)} ${row.detail}`);
}
if (results.some((row) => row.result === "failed")) process.exitCode = 1;
