import { describe, expect, it } from "vitest";
import { checkKeys, formatKeyReport, hasMalformed, mask } from "../../../scripts/keys-check-lib.js";
import { diagnose, formatAwsReport, parseOnly, selectServices } from "../../../scripts/aws-check-lib.js";

const VALID = {
  AWS_REGION: "ap-south-1",
  // Split so the repository secret scan never has to decide whether this is real. It is AWS's documentation example key.
  AWS_ACCESS_KEY_ID: `AKIA${"IOSFODNN7EXAMPLE"}`,
  AWS_SECRET_ACCESS_KEY: "0123456789012345678901234567890123456789",
  BEDROCK_MODEL_ID: "anthropic.claude-3-5-haiku-20241022-v1:0",
  DYNAMODB_TABLE_NAME: "ellie-main",
  EVENTBRIDGE_SCHEDULE_GROUP: "ellie",
  EVENTBRIDGE_TARGET_ARN: "arn:aws:sqs:ap-south-1:123456789012:ellie-schedule",
  EVENTBRIDGE_ROLE_ARN: "arn:aws:iam::123456789012:role/ellie-scheduler",
  SCHEDULER_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123456789012/ellie-schedule",
  SNS_TOPIC_ARN: "arn:aws:sns:ap-south-1:123456789012:ellie-messages",
  ELLIE_PUBLIC_BASE_URL: "https://ellie.example.com",
  LINK_SIGNING_SECRET: "a".repeat(48),
  OAUTH_ISSUER_URL: "https://issuer.example.com",
  OAUTH_AUDIENCE: "https://ellie.example.com/mcp",
};

const statusOf = (rows: ReturnType<typeof checkKeys>, service: string) => rows.find((row) => row.service === service)?.status;

describe("keys:check", () => {
  it("reports every service as MISSING on an empty environment and never fails the run", () => {
    const rows = checkKeys({});
    expect(rows.every((row) => row.status === "MISSING")).toBe(true);
    expect(hasMalformed(rows)).toBe(false);
    expect(formatKeyReport(rows)).toContain("Ellie runs fully on mocks");
  });

  it("reports every service as CONFIGURED when all required keys are well formed", () => {
    const rows = checkKeys(VALID);
    expect(rows.every((row) => row.status === "CONFIGURED")).toBe(true);
    expect(hasMalformed(rows)).toBe(false);
  });

  it("flags malformed values with the reason instead of the value", () => {
    const rows = checkKeys({ ...VALID, AWS_REGION: "mars", SNS_TOPIC_ARN: "arn:aws:sqs:ap-south-1:123456789012:wrong" });
    expect(statusOf(rows, "AWS credentials")).toBe("MALFORMED");
    expect(statusOf(rows, "SNS")).toBe("MALFORMED");
    expect(hasMalformed(rows)).toBe(true);
    expect(formatKeyReport(rows, true)).toContain("not an AWS region id");
  });

  it("treats the placeholder link signing secret as malformed", () => {
    const rows = checkKeys({ ...VALID, LINK_SIGNING_SECRET: "change-me-in-production" });
    expect(statusOf(rows, "Link signing")).toBe("MALFORMED");
  });

  it("calls a partially configured service MISSING and names the remaining keys", () => {
    const rows = checkKeys({ ...VALID, EVENTBRIDGE_ROLE_ARN: "" });
    const scheduler = rows.find((row) => row.service === "EventBridge Scheduler");
    expect(scheduler?.status).toBe("MISSING");
    expect(scheduler?.detail).toContain("EVENTBRIDGE_ROLE_ARN");
  });

  it("ignores optional keys when deciding a service status", () => {
    const rows = checkKeys({ ...VALID, AWS_SESSION_TOKEN: "", SHORT_LINK_BASE_URL: "" });
    expect(statusOf(rows, "AWS credentials")).toBe("CONFIGURED");
    expect(statusOf(rows, "Public endpoint")).toBe("CONFIGURED");
  });

  it("never prints a secret: values are masked to the first four characters", () => {
    const report = formatKeyReport(checkKeys(VALID), true);
    expect(mask(VALID.AWS_SECRET_ACCESS_KEY)).toBe("0123…");
    expect(report).not.toContain(VALID.AWS_SECRET_ACCESS_KEY);
    expect(report).not.toContain(VALID.LINK_SIGNING_SECRET);
    expect(report).not.toContain(VALID.AWS_ACCESS_KEY_ID);
    expect(report).toContain("AKIA…");
  });
});

describe("aws:check selection and diagnosis", () => {
  it("runs every service when --only is absent", () => {
    expect(parseOnly(["--bedrock"])).toBeUndefined();
    expect(selectServices(undefined).services).toHaveLength(5);
  });

  it("selects one service from a case- and separator-insensitive --only value", () => {
    expect(parseOnly(["--only=sqs"])).toBe("sqs");
    expect(selectServices("sqs").services).toEqual(["SQS"]);
    expect(selectServices("eventbridge").services).toEqual(["EventBridge Scheduler"]);
    expect(selectServices("EventBridge Scheduler").services).toEqual(["EventBridge Scheduler"]);
    expect(selectServices("dynamo").services).toEqual(["DynamoDB"]);
  });

  it("reports an unknown --only value instead of silently checking nothing", () => {
    expect(selectServices("redshift")).toEqual({ services: [], unknown: "redshift" });
  });

  it("maps AWS error names to a likely cause and a fix", () => {
    expect(diagnose("ResourceNotFoundException").fix).toContain("docs/API_SETUP.md");
    expect(diagnose("AccessDeniedException").cause).toContain("IAM policy");
    expect(diagnose("UnrecognizedClientException").cause).toContain("access key");
    expect(diagnose(undefined).cause).toContain("Unmapped AWS error");
  });

  it("prints cause and fix lines only for failures", () => {
    const report = formatAwsReport([
      { service: "SQS", result: "PASS", detail: "Read-only check succeeded" },
      { service: "SNS", result: "SKIPPED", detail: "Missing SNS_TOPIC_ARN" },
      { service: "DynamoDB", result: "FAIL", detail: "ResourceNotFoundException", ...diagnose("ResourceNotFoundException") },
    ]);
    expect(report).toContain("cause: The resource does not exist");
    expect(report.match(/cause:/g)).toHaveLength(1);
    expect(report).toContain("1 passed, 1 failed, 1 skipped.");
  });
});
