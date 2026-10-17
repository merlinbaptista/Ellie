export type CheckStatus = "PASS" | "FAIL" | "WARN";
/** CODE problems are repository defects and must be zero. CREDENTIAL gaps only real deployment values can close. */
export type CheckKind = "CODE" | "CREDENTIAL";
export interface PreflightCheck { status: CheckStatus; kind: CheckKind; label: string; detail: string }
export interface PreflightConfig {
  NODE_ENV: string; LINK_SIGNING_SECRET: string; ELLIE_PUBLIC_BASE_URL: string; HOST: string; SIMULATOR_ENABLED: boolean;
  SIM_ACCESS_CODE?: string; CORS_ORIGINS: string[]; ELLIE_FAKE_NOW?: string; OAUTH_ENABLED: boolean; ELLIE_DOCKER?: string;
  STORAGE_DRIVER: string; LLM_DRIVER: string; NOTIFY_DRIVER: string; SCHEDULER_DRIVER: string;
}
export function staticPreflight(config: PreflightConfig): PreflightCheck[] {
  const production = config.NODE_ENV === "production";
  const base = (() => { try { return new URL(config.ELLIE_PUBLIC_BASE_URL); } catch { return undefined; } })();
  const checks: PreflightCheck[] = [];
  const add = (condition: boolean, kind: CheckKind, label: string, detail: string, status: CheckStatus = "FAIL") => checks.push({ status: condition ? "PASS" : status, kind, label, detail: condition ? "OK" : detail });
  add(production, "CREDENTIAL", "NODE_ENV", "Must be production for go-live");
  add(config.LINK_SIGNING_SECRET !== "change-me-in-production" && config.LINK_SIGNING_SECRET.length >= 32, "CREDENTIAL", "Link signing secret", "Must be non-default and at least 32 characters");
  add(Boolean(base && base.protocol === "https:" && base.host), "CREDENTIAL", "Public base URL", "Must be a valid HTTPS URL; its host is the configured MCP host allow-list entry");
  const expectedHost = config.ELLIE_DOCKER === "true" ? "0.0.0.0" : "127.0.0.1";
  add(config.HOST === expectedHost, "CODE", "HOST binding", `Expected ${expectedHost} for this deployment mode`);
  add(!config.SIMULATOR_ENABLED || (config.SIM_ACCESS_CODE?.length ?? 0) >= 12, "CREDENTIAL", "Simulator gate", "Disable simulator or configure an access code of at least 12 characters");
  add(!production || !config.CORS_ORIGINS.some((origin) => /localhost|127\.0\.0\.1/i.test(origin)), "CODE", "CORS origins", "Production CORS should not include localhost", "WARN");
  add(!production || !config.ELLIE_FAKE_NOW, "CODE", "Fake clock", "ELLIE_FAKE_NOW should be empty outside a demo", "WARN");
  for (const [label, driver] of [["Storage", config.STORAGE_DRIVER], ["LLM", config.LLM_DRIVER], ["Notifier", config.NOTIFY_DRIVER], ["Scheduler", config.SCHEDULER_DRIVER]] as const) {
    // A mock driver is a missing-key gap; an unrecognised driver mode is a code defect.
    const unresolved = driver !== "mock" && driver !== "aws";
    checks.push({ status: driver === "aws" ? "PASS" : unresolved ? "FAIL" : "WARN", kind: unresolved ? "CODE" : "CREDENTIAL", label: `${label} driver`, detail: driver === "aws" ? "AWS driver requested" : unresolved ? `Unresolved driver mode: ${driver}` : "Mock driver selected; add the service keys to switch to AWS" });
  }
  checks.push({ status: "PASS", kind: "CODE", label: "OAuth", detail: config.OAUTH_ENABLED ? "Enabled" : "Disabled" });
  return checks;
}

export interface PreflightSummary { passed: boolean; codeProblems: number; credentialGaps: number; warnings: number }
export function summarizePreflight(checks: PreflightCheck[]): PreflightSummary {
  const codeProblems = checks.filter((check) => check.kind === "CODE" && check.status === "FAIL").length;
  const credentialGaps = checks.filter((check) => check.kind === "CREDENTIAL" && check.status !== "PASS").length;
  return { passed: codeProblems === 0, codeProblems, credentialGaps, warnings: checks.filter((check) => check.status === "WARN").length };
}
