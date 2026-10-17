import { describe, expect, it } from "vitest";
import { demoScript } from "../src/demo/script.js";
import { registerAllTools } from "../src/mcp/tools/index.js";
import { createTestContext } from "./helpers.js";

describe("demo script", () => {
  it("validates and references registered tools from every spoken step", async () => {
    const ctx = await createTestContext();
    const tools: string[] = [];
    registerAllTools({ registerTool(name: string) { tools.push(name); } } as never, ctx);
    expect(demoScript.length).toBeGreaterThan(0);
    for (const step of demoScript) {
      expect(step.household).toMatch(/^(demo-blr|demo-tx|fresh)$/);
      if (step.action.kind === "say") expect(step.expect.tools?.every((tool) => tools.includes(tool))).toBe(true);
    }
  });
});
