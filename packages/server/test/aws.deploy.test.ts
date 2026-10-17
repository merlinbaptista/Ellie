import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

describe("AWS deployment helpers", () => {
  it("prints ordered CloudFormation commands in dry-run mode without requiring AWS CLI execution", () => {
    const cli = resolve(root, "node_modules/tsx/dist/cli.mjs");
    const result = execFileSync(process.execPath, [cli, resolve(root, "scripts/aws-deploy.ts")], { cwd: root, env: { ...process.env, AWS_REGION: "us-east-1" }, encoding: "utf8" });
    expect(result).toContain("cloudformation deploy --template-file infra/dynamodb-table.yaml");
    expect(result).toContain("cloudformation deploy --template-file infra/ellie-messaging.yaml");
    expect(result.indexOf("dynamodb-table.yaml")).toBeLessThan(result.indexOf("ellie-messaging.yaml"));
    expect(result).toContain("Dry run only");
  });
});
