import { describe, expect, it } from "vitest";
import { ToolContracts, ToolContractShapes } from "../src/contracts.js";

describe("shared tool contracts", () => {
  it("accepts minimal valid inputs and rejects invalid enum/contract values", () => {
    const valid: Record<string, unknown>[] = [
      {},
      { item: "gas", type: "changed" },
      {},
      { item: "gas" },
      { item: "purifier", symptom: "beeping" },
      { contentType: "fix" },
      {},
      { item: "purifier" },
      {},
      { action: "status" },
      { item: "purifier", cause: "filter", fix: "replace" },
      {},
    ];
    const names = Object.keys(ToolContracts) as Array<keyof typeof ToolContracts>;
    names.forEach((name, index) => expect(ToolContracts[name].safeParse(valid[index]).success, name).toBe(true));
    expect(ToolContracts.log_event.safeParse({ item: "gas", type: "unknown" }).success).toBe(false);
    expect(ToolContracts.send_to_phone.safeParse({ contentType: "call" }).success).toBe(false);
    expect(ToolContracts.due_this_week.safeParse({ days: 32 }).success).toBe(false);
  });

  it("exports raw Zod shapes and descriptions for every field", () => {
    for (const shape of Object.values(ToolContractShapes)) {
      expect(Object.keys(shape).length).toBeGreaterThan(0);
      for (const field of Object.values(shape)) expect(field.description).toBeTruthy();
    }
  });
});
