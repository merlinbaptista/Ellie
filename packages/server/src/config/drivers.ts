import type { Env } from "./env.js";
import { ConfigError } from "../lib/errors.js";

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

export const AWS_ADAPTER_MODULE: Record<ServiceName, number> = {
  storage: 3,
  llm: 5,
  notifier: 6,
  scheduler: 6,
};

const hasCredentials = (env: Env) => Boolean(
  env.AWS_PROFILE || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
);
const credentialsMissing = (env: Env) =>
  hasCredentials(env) ? [] : ["AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"];

export function resolveDrivers(env: Env): Record<ServiceName, DriverDecision> {
  const requirements: Record<ServiceName, { keys: string[]; ready: boolean; mock: string; aws: string }> = {
    storage: {
      keys: env.DYNAMODB_ENDPOINT
        ? ["DYNAMODB_TABLE_NAME"]
        : ["AWS_REGION", "DYNAMODB_TABLE_NAME", ...credentialsMissing(env)],
      ready: Boolean(env.DYNAMODB_TABLE_NAME && (env.DYNAMODB_ENDPOINT || (env.AWS_REGION && hasCredentials(env)))),
      mock: env.MOCK_STORAGE_MODE === "memory" ? "memory-store" : "file-store",
      aws: env.DYNAMODB_ENDPOINT ? "dynamodb-local" : "dynamodb",
    },
    llm: {
      keys: ["AWS_REGION", "BEDROCK_MODEL_ID"],
      ready: Boolean(env.AWS_REGION && env.BEDROCK_MODEL_ID),
      mock: "mock-llm",
      aws: "bedrock",
    },
    notifier: {
      keys: ["AWS_REGION", ...credentialsMissing(env), "SNS_TOPIC_ARN or SNS_SMS_ENABLED"],
      ready: Boolean(env.AWS_REGION && hasCredentials(env) && (env.SNS_TOPIC_ARN || env.SNS_SMS_ENABLED)),
      mock: "console-outbox",
      aws: "sns",
    },
    scheduler: {
      keys: ["AWS_REGION", "EVENTBRIDGE_TARGET_ARN", "EVENTBRIDGE_ROLE_ARN", ...credentialsMissing(env)],
      ready: Boolean(env.AWS_REGION && env.EVENTBRIDGE_TARGET_ARN && env.EVENTBRIDGE_ROLE_ARN && hasCredentials(env)),
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
      reason: resolved === "aws"
        ? service === "storage" && env.DYNAMODB_ENDPOINT ? `DynamoDB Local at ${env.DYNAMODB_ENDPOINT}`
          : service === "llm" ? `Bedrock model ${env.BEDROCK_MODEL_ID}` : "AWS requirements are configured"
        : `Needs ${missingKeys.join(", ")}`,
      missingKeys,
    };
  }
  return decisions;
}
