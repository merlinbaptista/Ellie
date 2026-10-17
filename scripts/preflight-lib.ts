export type CheckStatus = "PASS" | "FAIL" | "WARN";
export interface PreflightCheck { status: CheckStatus; label: string; detail: string }
export interface PreflightConfig {
  NODE_ENV: string; LINK_SIGNING_SECRET: string; ELLIE_PUBLIC_BASE_URL: string; HOST: string; SIMULATOR_ENABLED: boolean;
  SIM_ACCESS_CODE?: string; CORS_ORIGINS: string[]; ELLIE_FAKE_NOW?: string; OAUTH_ENABLED: boolean; ELLIE_DOCKER?: string;
  STORAGE_DRIVER: string; LLM_DRIVER: string; NOTIFY_DRIVER: string; SCHEDULER_DRIVER: string;
}
export function staticPreflight(config: PreflightConfig): PreflightCheck[] {
  const production = config.NODE_ENV === "production";
  const base = (() => { try { return new URL(config.ELLIE_PUBLIC_BASE_URL); } catch { return undefined; } })();
  const checks: PreflightCheck[] = [];
  const add = (condition: boolean, label: string, detail: string, status: CheckStatus = "FAIL") => checks.push({ status: condition ? "PASS" : status, label, detail: condition ? "OK" : detail });
  add(production, "NODE_ENV", "Must be production for go-live");
  add(config.LINK_SIGNING_SECRET !== "change-me-in-production" && config.LINK_SIGNING_SECRET.length >= 32, "Link signing secret", "Must be non-default and at least 32 characters");
  add(Boolean(base && base.protocol === "https:" && base.host), "Public base URL", "Must be a valid HTTPS URL; its host is the configured MCP host allow-list entry");
  const expectedHost = config.ELLIE_DOCKER === "true" ? "0.0.0.0" : "127.0.0.1";
  add(config.HOST === expectedHost, "HOST binding", `Expected ${expectedHost} for this deployment mode`);
  add(!config.SIMULATOR_ENABLED || (config.SIM_ACCESS_CODE?.length ?? 0) >= 12, "Simulator gate", "Disable simulator or configure an access code of at least 12 characters");
  add(!config.CORS_ORIGINS.some((origin) => /localhost|127\.0\.0\.1/i.test(origin)), "CORS origins", "Production CORS should not include localhost", "WARN");
  add(!config.ELLIE_FAKE_NOW, "Fake clock", "ELLIE_FAKE_NOW should be empty outside a demo", "WARN");
  for (const [label, driver] of [["Storage", config.STORAGE_DRIVER], ["LLM", config.LLM_DRIVER], ["Notifier", config.NOTIFY_DRIVER], ["Scheduler", config.SCHEDULER_DRIVER]] as const) {
    checks.push({ status: driver === "mock" ? "WARN" : driver === "aws" ? "PASS" : "FAIL", label: `${label} driver`, detail: driver === "mock" ? "Mock driver selected in production" : driver === "aws" ? "AWS driver requested" : `Unresolved driver mode: ${driver}` });
  }
  checks.push({ status: "PASS", label: "OAuth", detail: config.OAUTH_ENABLED ? "Enabled" : "Disabled" });
  return checks;
}

export function summarizePreflight(checks: PreflightCheck[]): { passed: boolean; failures: number; warnings: number } {
  return { passed: !checks.some((check) => check.status === "FAIL"), failures: checks.filter((check) => check.status === "FAIL").length, warnings: checks.filter((check) => check.status === "WARN").length };
}
