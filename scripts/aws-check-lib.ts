/** Shared, side-effect-free helpers for `npm run aws:check`, so the selection and diagnosis logic is testable without AWS. */
export type AwsCheckResult = "PASS" | "FAIL" | "SKIPPED";

export interface AwsCheckRow {
  service: string;
  result: AwsCheckResult;
  detail: string;
  cause?: string;
  fix?: string;
}

export const AWS_CHECK_SERVICES = ["DynamoDB", "Bedrock", "SNS", "EventBridge Scheduler", "SQS"] as const;

/** `--only=sqs`, `--only="EventBridge Scheduler"` and `--only=eventbridge` all select the same check. */
export function parseOnly(argv: readonly string[]): string | undefined {
  const flag = argv.find((argument) => argument.startsWith("--only="));
  const value = flag?.slice("--only=".length).trim();
  return value ? value : undefined;
}

export function selectServices(only: string | undefined): { services: string[]; unknown?: string } {
  if (!only) return { services: [...AWS_CHECK_SERVICES] };
  const needle = only.toLowerCase().replace(/[\s_-]/g, "");
  const matches = AWS_CHECK_SERVICES.filter((service) => service.toLowerCase().replace(/[\s_-]/g, "").startsWith(needle));
  return matches.length ? { services: matches } : { services: [], unknown: only };
}

const DIAGNOSES: { match: RegExp; cause: string; fix: string }[] = [
  { match: /^ResourceNotFoundException$/, cause: "The resource does not exist in this account and region", fix: "Create it, or correct the name/ARN and AWS_REGION; see docs/API_SETUP.md" },
  { match: /^(AccessDenied|AccessDeniedException|NotAuthorized|AuthorizationError)/, cause: "The credentials are valid but the IAM policy does not allow this action", fix: "Attach infra/iam-policy-all.json (or the per-service policy) to the user or role" },
  { match: /^(UnrecognizedClientException|InvalidClientTokenId|InvalidSignatureException)$/, cause: "The access key is wrong, inactive, or belongs to another partition", fix: "Re-issue the key pair and update AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY" },
  { match: /^(ExpiredToken|ExpiredTokenException)$/, cause: "The temporary session token has expired", fix: "Refresh the session and update AWS_SESSION_TOKEN" },
  { match: /^(ValidationException|InvalidParameter|InvalidParameterValue|InvalidArn)/, cause: "A configured identifier is the wrong shape for this service", fix: "Run `npm run keys:check -- --verbose` and correct the MALFORMED value" },
  { match: /^(ThrottlingException|TooManyRequestsException|LimitExceeded)/, cause: "The account is being throttled or is at a service quota", fix: "Retry shortly, or request a quota increase in Service Quotas" },
  { match: /^(TimeoutError|RequestTimeout|NetworkingError|ENOTFOUND|ECONNREFUSED|EAI_AGAIN)/, cause: "The endpoint was unreachable from this machine", fix: "Check connectivity, any corporate proxy, and that AWS_REGION names a real region" },
  { match: /^(AccessDeniedException|ModelNotReady|ValidationException)$/, cause: "Model access has not been granted in this region", fix: "Request access to the model in the Bedrock console, then retry" },
  { match: /^QueueDoesNotExist$/, cause: "The queue URL points at a queue that no longer exists", fix: "Recreate the queue or update SCHEDULER_QUEUE_URL" },
];

export function diagnose(errorName: string | undefined): { cause: string; fix: string } {
  const name = errorName ?? "";
  const hit = DIAGNOSES.find((entry) => entry.match.test(name));
  return hit
    ? { cause: hit.cause, fix: hit.fix }
    : { cause: `Unmapped AWS error: ${name || "unknown"}`, fix: "Re-run with AWS_SDK_LOG_LEVEL=warn and check the service console for this resource" };
}

export function formatAwsReport(rows: readonly AwsCheckRow[]): string {
  const glyph = { PASS: "✔", FAIL: "✖", SKIPPED: "-" } as const;
  const lines = ["Service                 Result    Detail", "----------------------  --------  -----------------------------------------------"];
  for (const row of rows) {
    lines.push(`${row.service.padEnd(23)} ${glyph[row.result]} ${row.result.padEnd(8)} ${row.detail}`);
    if (row.result === "FAIL") {
      lines.push(`    cause: ${row.cause ?? "unknown"}`);
      lines.push(`    fix:   ${row.fix ?? "see docs/API_SETUP.md"}`);
    }
  }
  const failed = rows.filter((row) => row.result === "FAIL").length;
  const skipped = rows.filter((row) => row.result === "SKIPPED").length;
  lines.push("");
  lines.push(`${rows.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped.`);
  return lines.join("\n");
}
