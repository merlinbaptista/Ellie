import pino, { type Logger } from "pino";
import { getEnv } from "../config/env.js";
import { redactObject } from "../privacy/redact.js";

const config = getEnv();
const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ["phone", "*.phone", "authorization", "AWS_SECRET_ACCESS_KEY", "LINK_SIGNING_SECRET"],
    censor: "[REDACTED]",
  },
  formatters: { log: (object) => redactObject(object) as Record<string, unknown> },
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } }
    : {}),
});

export { logger };
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
