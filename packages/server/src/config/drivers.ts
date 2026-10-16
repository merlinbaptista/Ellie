import type { Env } from "./env.js";
import { ConfigError } from "../lib/errors.js";
import { probeAwsCredentials } from "./awsCredentials.js";

export type ServiceName = "storage" | "llm" | "notifier" | "scheduler";
export type ResolvedDriver = "mock" | "aws";
export interface DriverDecision {
  service: ServiceName;
  requested: "auto" | "mock" | "aws";
  resolved: ResolvedDriver;
  implementation: string;
  reason: string;
  missingKeys: string[];
}

const hasCredentials = (env: Env) => Boolean(
  env.AWS_PROFILE || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
);

export async function resolveDrivers(env: Env): Promise<Record<ServiceName, DriverDecision>> {
  const needsCredentialProbe = !hasCredentials(env) && Boolean(env.AWS_REGION && (
    env.BEDROCK_MODEL_ID || env.SNS_TOPIC_ARN || env.SNS_SMS_ENABLED ||
    env.EVENTBRIDGE_TARGET_ARN || env.EVENTBRIDGE_ROLE_ARN || env.SCHEDULER_QUEUE_URL
  ));
  const credentialsAvailable = hasCredentials(env) || (needsCredentialProbe && await probeAwsCredentials());
  const credentialKeys = needsCredentialProbe && !credentialsAvailable ? ["No AWS credentials found by the SDK chain"] : [];
  const notifierCredentialKeys = credentialsAvailable ? [] : credentialKeys.length ? credentialKeys : ["AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"];
  const requirements: Record<ServiceName, { keys: string[]; ready: boolean; mock: string; aws: string }> = {
    storage: {
      keys: env.DYNAMODB_ENDPOINT
        ? ["DYNAMODB_TABLE_NAME"]
        : ["AWS_REGION", "DYNAMODB_TABLE_NAME", ...(hasCredentials(env) ? [] : ["AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"])],
      ready: Boolean(env.DYNAMODB_TABLE_NAME && (env.DYNAMODB_ENDPOINT || (env.AWS_REGION && hasCredentials(env)))),
      mock: env.MOCK_STORAGE_MODE === "memory" ? "memory-store" : "file-store",
      aws: env.DYNAMODB_ENDPOINT ? "dynamodb-local" : "dynamodb",
    },
    llm: {
      keys: ["AWS_REGION", "BEDROCK_MODEL_ID", ...credentialKeys],
      ready: Boolean(env.AWS_REGION && env.BEDROCK_MODEL_ID && credentialsAvailable),
      mock: "mock-llm",
      aws: "bedrock",
    },
    notifier: {
      keys: ["AWS_REGION", ...notifierCredentialKeys, "SNS_TOPIC_ARN or SNS_SMS_ENABLED"],
      ready: Boolean(env.AWS_REGION && credentialsAvailable && (env.SNS_TOPIC_ARN || env.SNS_SMS_ENABLED)),
      mock: "console-outbox",
      aws: "sns",
    },
    scheduler: {
      keys: ["AWS_REGION", "EVENTBRIDGE_TARGET_ARN", "EVENTBRIDGE_ROLE_ARN", ...notifierCredentialKeys],
      ready: Boolean(env.AWS_REGION && env.EVENTBRIDGE_TARGET_ARN && env.EVENTBRIDGE_ROLE_ARN && env.SCHEDULER_QUEUE_URL && credentialsAvailable),
      mock: "local-timer",
      aws: "eventbridge",
    },
  };
  const switches = {
    storage: env.STORAGE_DRIVER,
    llm: env.LLM_DRIVER,
    notifier: env.NOTIFY_DRIVER,
    scheduler: env.SCHEDULER_DRIVER,
  } as const;
  const decisions = {} as Record<ServiceName, DriverDecision>;

  for (const service of Object.keys(requirements) as ServiceName[]) {
    const requirement = requirements[service];
    const requested = switches[service];
    const missingKeys = requirement.keys.filter((key) => {
      if (service === "storage" && key === "DYNAMODB_TABLE_NAME") return !env.DYNAMODB_TABLE_NAME;
      if (key === "SNS_TOPIC_ARN or SNS_SMS_ENABLED") return !env.SNS_TOPIC_ARN && !env.SNS_SMS_ENABLED;
      if (key.startsWith("AWS_PROFILE or")) return !hasCredentials(env);
      if (key === "No AWS credentials found by the SDK chain") return !credentialsAvailable;
      return !env[key as keyof Env];
    });
    if (requested === "aws" && missingKeys.length > 0) {
      throw new ConfigError(`${service} requires: ${missingKeys.join(", ")}`);
    }
    const resolved = requested === "mock" ? "mock" : requested === "aws" || requirement.ready ? "aws" : "mock";
    decisions[service] = {
      service,
      requested,
      resolved,
      implementation: resolved === "aws" ? requirement.aws : requirement.mock,
      reason: !credentialsAvailable && credentialKeys.length > 0 && requirement.keys.includes(credentialKeys[0]!)
        ? "No AWS credentials found by the SDK chain"
        : resolved === "aws"
        ? service === "storage" && env.DYNAMODB_ENDPOINT ? `DynamoDB Local at ${env.DYNAMODB_ENDPOINT}`
          : service === "llm" ? `Bedrock model ${env.BEDROCK_MODEL_ID}` : "AWS requirements are configured"
        : `Needs ${missingKeys.join(", ")}`,
      missingKeys,
    };
  }
  return decisions;
}
