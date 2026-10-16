import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";

const stackIndex = process.argv.indexOf("--stack");
const stackName = stackIndex >= 0 ? process.argv[stackIndex + 1] : undefined;
if (!stackName) throw new Error("Usage: npm run aws:env -- --stack ellie-messaging");
const client = new CloudFormationClient({ region: process.env.AWS_REGION });
try {
  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = new Map((response.Stacks?.[0]?.Outputs ?? []).map((output) => [output.OutputKey ?? "", output.OutputValue ?? ""]));
  const values: Array<[string, string | undefined]> = [
    ["SNS_TOPIC_ARN", outputs.get("SNS_TOPIC_ARN")],
    ["EVENTBRIDGE_TARGET_ARN", outputs.get("EVENTBRIDGE_TARGET_ARN")],
    ["EVENTBRIDGE_ROLE_ARN", outputs.get("EVENTBRIDGE_ROLE_ARN")],
    ["SCHEDULER_QUEUE_URL", outputs.get("SCHEDULER_QUEUE_URL")],
    ["EVENTBRIDGE_SCHEDULE_GROUP", outputs.get("EVENTBRIDGE_SCHEDULE_GROUP")],
  ];
  for (const [key, value] of values) if (value) console.log(`${key}=${value}`);
} finally { client.destroy(); }
