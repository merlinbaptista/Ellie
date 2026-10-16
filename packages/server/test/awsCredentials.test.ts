import { beforeEach, describe, expect, it, vi } from "vitest";

const { credentialProvider } = vi.hoisted(() => ({ credentialProvider: vi.fn() }));
vi.mock("@aws-sdk/credential-providers", () => ({ fromNodeProviderChain: () => credentialProvider }));

async function loadCredentialModule() {
  vi.resetModules();
  return import("../src/config/awsCredentials.js");
}

describe("AWS SDK credentials probe", () => {
  beforeEach(() => {
    vi.resetModules();
    credentialProvider.mockReset();
  });

  it("resolves and caches a credential provider success", async () => {
    credentialProvider.mockResolvedValue({ accessKeyId: "from-chain", secretAccessKey: "secret" });
    const { probeAwsCredentials } = await loadCredentialModule();
    await expect(probeAwsCredentials()).resolves.toBe(true);
    await expect(probeAwsCredentials()).resolves.toBe(true);
    expect(credentialProvider).toHaveBeenCalledTimes(1);
  });

  it("caches provider rejection and falls back to mock drivers", async () => {
    credentialProvider.mockRejectedValue(new Error("credentials unavailable"));
    const { resolveDrivers } = await import("../src/config/drivers.js");
    const { loadEnv } = await import("../src/config/env.js");
    const drivers = await resolveDrivers(loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model" }));
    expect(drivers.llm.resolved).toBe("mock");
    expect(drivers.llm.reason).toBe("No AWS credentials found by the SDK chain");
    expect(credentialProvider).toHaveBeenCalledTimes(1);
  });

  it("fails explicit AWS selection with a clear credential-chain error", async () => {
    credentialProvider.mockRejectedValue(new Error("credentials unavailable"));
    vi.resetModules();
    const { resolveDrivers } = await import("../src/config/drivers.js");
    const { loadEnv } = await import("../src/config/env.js");
    await expect(resolveDrivers(loadEnv({ AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "model", LLM_DRIVER: "aws" })))
      .rejects.toThrow("llm requires: No AWS credentials found by the SDK chain");
  });
});
