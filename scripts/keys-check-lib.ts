/** Reports which external services are provisioned. Never prints a secret: values are masked to 4 characters. */
export type KeyStatus = "CONFIGURED" | "MISSING" | "MALFORMED";

export interface KeySpec {
  key: string;
  /** Optional keys do not make a service MISSING when absent. */
  optional?: boolean;
  /** Returns a reason when the present value is malformed, otherwise undefined. */
  validate?: (value: string) => string | undefined;
}

export interface KeyRow {
  key: string;
  status: KeyStatus;
  masked: string;
  detail: string;
}

export interface ServiceRow {
  service: string;
  status: KeyStatus;
  detail: string;
  keys: KeyRow[];
}

export type KeySource = Record<string, string | undefined>;

export function mask(value: string | undefined): string {
  if (value === undefined || value === "") return "(unset)";
  return value.length <= 4 ? `${value}…` : `${value.slice(0, 4)}…`;
}

const url = (protocols: string[]) => (value: string): string | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "not a valid URL";
  }
  return protocols.includes(parsed.protocol) ? undefined : `expected ${protocols.join(" or ")} URL`;
};

const arn = (service: string, resource?: RegExp) => (value: string): string | undefined => {
  const parts = value.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return "not an ARN (expected arn:aws:…)";
  if (parts[2] !== service) return `not an ${service} ARN`;
  // IAM is a global service, so its ARNs carry an empty region segment.
  if (!parts[3] && service !== "iam") return "ARN is missing its region";
  if (!/^\d{12}$/.test(parts[4] ?? "")) return "ARN is missing a 12-digit account id";
  if (resource && !resource.test(parts.slice(5).join(":"))) return `unexpected ${service} resource in the ARN`;
  return undefined;
};

const minLength = (length: number) => (value: string): string | undefined =>
  value.length >= length ? undefined : `must be at least ${length} characters`;

const awsRegion = (value: string): string | undefined =>
  /^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(value) ? undefined : "not an AWS region id (for example us-east-1)";

export const SERVICES: { service: string; purpose: string; keys: KeySpec[] }[] = [
  {
    service: "AWS credentials",
    purpose: "Signs every AWS SDK call",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "AWS_ACCESS_KEY_ID", validate: (value) => (/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(value) ? undefined : "not an AWS access key id") },
      { key: "AWS_SECRET_ACCESS_KEY", validate: minLength(40) },
      { key: "AWS_SESSION_TOKEN", optional: true },
      { key: "AWS_PROFILE", optional: true },
    ],
  },
  {
    service: "Bedrock",
    purpose: "Ranks diagnosis causes, routes simulator utterances, translates phone copy",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "BEDROCK_MODEL_ID", validate: (value) => (/^[a-z0-9][\w.:-]*$/i.test(value) ? undefined : "not a Bedrock model or inference-profile id") },
      { key: "BEDROCK_GUARDRAIL_ID", optional: true },
      { key: "BEDROCK_GUARDRAIL_VERSION", optional: true },
    ],
  },
  {
    service: "DynamoDB",
    purpose: "Stores households, items, events, predictions and schedules",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "DYNAMODB_TABLE_NAME", validate: (value) => (/^[\w.-]{3,255}$/.test(value) ? undefined : "table names allow 3-255 characters of A-Z a-z 0-9 _ . -") },
      { key: "DYNAMODB_ENDPOINT", optional: true, validate: url(["http:", "https:"]) },
    ],
  },
  {
    service: "EventBridge Scheduler",
    purpose: "Fires reminders at the household's local time",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "EVENTBRIDGE_SCHEDULE_GROUP", validate: (value) => (/^[\w.-]{1,64}$/.test(value) ? undefined : "group names allow 1-64 characters of A-Z a-z 0-9 _ . -") },
      { key: "EVENTBRIDGE_TARGET_ARN", validate: arn("sqs") },
      { key: "EVENTBRIDGE_ROLE_ARN", validate: arn("iam") },
    ],
  },
  {
    service: "SQS",
    purpose: "Receives scheduler fires so the server can recheck staleness before sending",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "SCHEDULER_QUEUE_URL", validate: url(["https:"]) },
    ],
  },
  {
    service: "SNS",
    purpose: "Delivers the phone handoff by SMS, with e-mail as the fallback",
    keys: [
      { key: "AWS_REGION", validate: awsRegion },
      { key: "SNS_TOPIC_ARN", validate: arn("sns") },
      { key: "SNS_SMS_SENDER_ID", optional: true },
      { key: "SNS_SMS_ENTITY_ID", optional: true },
      { key: "SNS_SMS_TEMPLATE_ID", optional: true },
    ],
  },
  {
    service: "Public endpoint",
    purpose: "The HTTPS base URL a phone and Alexa+ can reach (Cloudflare Tunnel or ngrok)",
    keys: [
      { key: "ELLIE_PUBLIC_BASE_URL", validate: url(["http:", "https:"]) },
      { key: "SHORT_LINK_BASE_URL", optional: true, validate: url(["http:", "https:"]) },
      { key: "PHONE_PAGE_BASE_URL", optional: true, validate: url(["http:", "https:"]) },
    ],
  },
  {
    service: "Link signing",
    purpose: "HMAC that makes phone links unforgeable",
    keys: [
      {
        key: "LINK_SIGNING_SECRET",
        validate: (value) =>
          value === "change-me-in-production"
            ? "still the placeholder value"
            : value.length >= 32
              ? undefined
              : "must be at least 32 characters",
      },
    ],
  },
  {
    service: "OAuth 2.1",
    purpose: "Optional: scopes an Alexa+ connection to one household",
    keys: [
      { key: "OAUTH_ISSUER_URL", validate: url(["https:"]) },
      { key: "OAUTH_AUDIENCE", validate: minLength(1) },
      { key: "OAUTH_JWKS_URL", optional: true, validate: url(["https:"]) },
    ],
  },
];

function evaluateKey(spec: KeySpec, source: KeySource): KeyRow {
  const raw = source[spec.key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") {
    return {
      key: spec.key,
      status: "MISSING",
      masked: "(unset)",
      detail: spec.optional ? "optional, not set" : "not set",
    };
  }
  const reason = spec.validate?.(value);
  return {
    key: spec.key,
    status: reason ? "MALFORMED" : "CONFIGURED",
    masked: mask(value),
    detail: reason ?? "set",
  };
}

export function checkKeys(source: KeySource): ServiceRow[] {
  return SERVICES.map(({ service, keys }) => {
    const rows = keys.map((spec) => evaluateKey(spec, source));
    const required = keys.filter((spec) => !spec.optional).map((spec) => spec.key);
    const malformed = rows.filter((row) => row.status === "MALFORMED");
    const missingRequired = rows.filter((row) => row.status === "MISSING" && required.includes(row.key));

    if (malformed.length) {
      return { service, status: "MALFORMED" as const, detail: malformed.map((row) => `${row.key}: ${row.detail}`).join("; "), keys: rows };
    }
    if (missingRequired.length === required.length) {
      return { service, status: "MISSING" as const, detail: "no keys set", keys: rows };
    }
    if (missingRequired.length) {
      return { service, status: "MISSING" as const, detail: `partially set; still need ${missingRequired.map((row) => row.key).join(", ")}`, keys: rows };
    }
    return { service, status: "CONFIGURED" as const, detail: "all required keys set", keys: rows };
  });
}

export function formatKeyReport(rows: ServiceRow[], verbose = false): string {
  const glyph = { CONFIGURED: "✔", MISSING: "-", MALFORMED: "✖" } as const;
  const lines = ["Service                 Status      Detail", "----------------------  ----------  ------------------------------------------------"];
  for (const row of rows) {
    lines.push(`${row.service.padEnd(23)} ${glyph[row.status]} ${row.status.padEnd(10)} ${row.detail}`);
    if (verbose) for (const key of row.keys) lines.push(`    ${key.key.padEnd(28)} ${key.masked.padEnd(10)} ${key.detail}`);
  }
  const counts = { CONFIGURED: 0, MISSING: 0, MALFORMED: 0 } as Record<KeyStatus, number>;
  for (const row of rows) counts[row.status] += 1;
  lines.push("");
  lines.push(`${counts.CONFIGURED} configured, ${counts.MISSING} missing, ${counts.MALFORMED} malformed.`);
  lines.push(
    counts.MALFORMED > 0
      ? "Fix every MALFORMED value before deploying; see docs/API_SETUP.md."
      : counts.CONFIGURED === 0
        ? "No external services are provisioned. Ellie runs fully on mocks; see docs/API_SETUP.md to go live."
        : "No malformed values. Run `npm run aws:check` to prove the configured services actually answer.",
  );
  return lines.join("\n");
}

export function hasMalformed(rows: ServiceRow[]): boolean {
  return rows.some((row) => row.status === "MALFORMED");
}
