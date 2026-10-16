import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalString = z.preprocess(blankToUndefined, z.string().optional());
const defaultString = (fallback: string) => z.preprocess(blankToUndefined, z.string().default(fallback));
const driver = z.preprocess(blankToUndefined, z.enum(["auto", "mock", "aws"]).default("auto"));
const bool = (fallback: boolean) =>
  z.preprocess((value) => {
    const normalized = blankToUndefined(value);
    if (normalized === undefined) return undefined;
    if (typeof normalized === "boolean") return normalized;
    if (normalized === "true" || normalized === "false") return normalized === "true";
    return normalized;
  }, z.boolean().default(fallback));
const positiveInt = (fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().positive().max(max).default(fallback));
const port = positiveInt(8787, 65535);

const envSchema = z.object({
  NODE_ENV: z.preprocess(blankToUndefined, z.enum(["development", "test", "production"]).default("development")),
  PORT: port,
  HOST: defaultString("127.0.0.1"),
  LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")),
  ELLIE_PUBLIC_BASE_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:8787")),
  CORS_ORIGINS: z.preprocess(
    (value) => {
      const normalized = blankToUndefined(value);
      return typeof normalized === "string" ? normalized.split(",").map((origin) => origin.trim()).filter(Boolean) : normalized;
    },
    z.array(z.string()).default(["http://localhost:5173", "http://localhost:5174"]),
  ),
  ELLIE_FAKE_NOW: z.preprocess(
    blankToUndefined,
    z.string().datetime({ offset: true }).optional(),
  ),
  DEFAULT_HOUSEHOLD_ID: defaultString("demo-blr"),
  STORAGE_DRIVER: driver,
  LLM_DRIVER: driver,
  NOTIFY_DRIVER: driver,
  SCHEDULER_DRIVER: driver,
  MOCK_STORAGE_MODE: z.preprocess(blankToUndefined, z.enum(["file", "memory"]).default("file")),
  DATA_DIR: defaultString("./data"),
  REGION_PACKS_DIR: optionalString,
  SEED_ON_START: bool(true),
  SEED_ANCHOR_DATE: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  EVENT_DEDUPE_WINDOW_SEC: positiveInt(120),
  DYNAMODB_TEST: bool(false),
  AWS_REGION: optionalString,
  AWS_PROFILE: optionalString,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  AWS_SESSION_TOKEN: optionalString,
  DYNAMODB_TABLE_NAME: optionalString,
  DYNAMODB_ENDPOINT: optionalString,
  BEDROCK_MODEL_ID: optionalString,
  BEDROCK_MAX_TOKENS: positiveInt(600),
  BEDROCK_GUARDRAIL_ID: optionalString,
  BEDROCK_GUARDRAIL_VERSION: optionalString,
  LLM_VOICE_TIMEOUT_MS: positiveInt(350),
  LLM_BACKGROUND_TIMEOUT_MS: positiveInt(8000),
  DIAGNOSIS_SESSION_TTL_HOURS: positiveInt(24),
  SNS_TOPIC_ARN: optionalString,
  SNS_SMS_ENABLED: bool(false),
  SNS_SMS_SENDER_ID: optionalString,
  SNS_SMS_ENTITY_ID: optionalString,
  SNS_SMS_TEMPLATE_ID: optionalString,
  SNS_SMS_TYPE: z.preprocess(blankToUndefined, z.enum(["Promotional", "Transactional", "CriticalTransaction"]).default("Transactional")),
  EVENTBRIDGE_SCHEDULE_GROUP: defaultString("ellie"),
  EVENTBRIDGE_TARGET_ARN: optionalString,
  EVENTBRIDGE_ROLE_ARN: optionalString,
  SCHEDULER_QUEUE_URL: optionalString,
  SCHEDULER_POLL_WAIT_SEC: positiveInt(20, 20),
  PHONE_LINK_TTL_HOURS: positiveInt(72),
  SHORT_LINK_BASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),
  PHONE_SEND_LIMIT_PER_HOUR: positiveInt(10),
  PHONE_PAGE_BASE_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:5174")),
  LINK_SIGNING_SECRET: defaultString("change-me-in-production"),
  OAUTH_ENABLED: bool(false),
  OAUTH_ISSUER_URL: optionalString,
  OAUTH_AUDIENCE: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const rows = parsed.error.issues.map((issue) => ({
      key: String(issue.path[0] ?? "environment"),
      error: issue.message,
    }));
    console.error("Invalid Ellie environment configuration:");
    console.table(rows);
    process.exitCode = 1;
    throw new Error("Invalid environment configuration");
  }
  const result = parsed.data;
  if (result.NODE_ENV === "production" && (result.LINK_SIGNING_SECRET === "change-me-in-production" || result.LINK_SIGNING_SECRET.length < 32)) {
    throw new Error("LINK_SIGNING_SECRET must be at least 32 characters in production");
  }
  return result;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}
export const env = new Proxy({} as Env, {
  get(_target, property: keyof Env) {
    return getEnv()[property];
  },
});
