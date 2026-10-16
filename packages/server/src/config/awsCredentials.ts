import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

let probeResult: Promise<boolean> | undefined;

export function probeAwsCredentials(timeoutMs = 1500): Promise<boolean> {
  if (!probeResult) {
    probeResult = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void fromNodeProviderChain()()
        .then(() => resolve(true), () => resolve(false))
        .finally(() => clearTimeout(timer));
    });
  }
  return probeResult;
}