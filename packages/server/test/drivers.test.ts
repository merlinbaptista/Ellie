import { describe, expect, it } from "vitest";
import { resolveDrivers } from "../src/config/drivers.js";
import { loadEnv } from "../src/config/env.js";
import { ConfigError } from "../src/lib/errors.js";

const blankEnv = () => loadEnv({});

describe("driver resolution", () => {
  it("selects mocks and reports requirements when all optional values are blank", () => {
    const drivers = resolveDrivers(blankEnv());
    expect(Object.values(drivers).map((driver) => driver.resolved)).toEqual(["mock", "mock", "mock", "mock"]);
    expect(drivers.storage.implementation).toBe("file-store");
    expect(drivers.llm.implementation).toBe("mock-llm");
    expect(drivers.notifier.implementation).toBe("console-outbox");
    expect(drivers.scheduler.implementation).toBe("local-timer");
    expect(drivers.storage.missingKeys).toEqual(["AWS_REGION", "DYNAMODB_TABLE_NAME", "AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"]);
    expect(drivers.llm.missingKeys).toEqual(["AWS_REGION", "BEDROCK_MODEL_ID", "AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"]);
    expect(drivers.notifier.missingKeys).toEqual(["AWS_REGION", "AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY", "SNS_TOPIC_ARN or SNS_SMS_ENABLED"]);
    expect(drivers.scheduler.missingKeys).toEqual(["AWS_REGION", "EVENTBRIDGE_TARGET_ARN", "EVENTBRIDGE_ROLE_ARN", "AWS_PROFILE or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY"]);
  });

  it("uses AWS when storage requirements and profile credentials are present", () => {
    const env = loadEnv({ AWS_REGION: "ap-south-1", AWS_PROFILE: "default", DYNAMODB_TABLE_NAME: "ellie" });
    expect(resolveDrivers(env).storage.resolved).toBe("aws");
  });

  it("selects DynamoDB Local from endpoint and table without AWS credentials", () => {
    const env = loadEnv({ DYNAMODB_ENDPOINT: "http://localhost:8000", DYNAMODB_TABLE_NAME: "ellie-main" });
    const storage = resolveDrivers(env).storage;
    expect(storage.resolved).toBe("aws");
    expect(storage.implementation).toBe("dynamodb-local");
    expect(storage.missingKeys).toEqual([]);
  });

  it("accepts paired access keys, lets explicit mock override credentials, and requires SNS topic or SMS", () => {
    const env = loadEnv({ AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "secret", DYNAMODB_TABLE_NAME: "table", STORAGE_DRIVER: "mock" });
    expect(resolveDrivers(env).storage.resolved).toBe("mock");
    const snsEnv = loadEnv({ AWS_REGION: "us-east-1", AWS_PROFILE: "default", SNS_SMS_ENABLED: "true" });
    expect(resolveDrivers(snsEnv).notifier.resolved).toBe("aws");
  });

  it("fails fast for explicit AWS with missing requirements", () => {
    const env = loadEnv({ STORAGE_DRIVER: "aws" });
    expect(() => resolveDrivers(env)).toThrow(ConfigError);
  });

  it("treats blank strings as missing and uses defaults", () => {
    const env = loadEnv({ PORT: "", NODE_ENV: "", SNS_SMS_ENABLED: "" });
    expect(env.PORT).toBe(8787);
    expect(env.NODE_ENV).toBe("development");
    expect(env.SNS_SMS_ENABLED).toBe(false);
  });
});
