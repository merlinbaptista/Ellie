import { describe, expect, it } from "vitest";
import { seedDemo } from "../src/seed/seed.js";
import { buildPrivacyExport } from "../src/privacy/export.js";
import { createTestContext } from "./helpers.js";

describe("privacy export", () => {
  it("includes household data while excluding full contacts and link secrets", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const exported = await buildPrivacyExport(ctx, "demo-blr");
    const serialized = JSON.stringify(exported);
    expect(exported.items.length).toBeGreaterThan(0);
    expect(exported.events.length).toBeGreaterThan(0);
    expect(exported.profile.contactMasked).toBe("•••• 0001");
    expect(serialized).not.toContain("+919000000001");
    expect(serialized).not.toContain("demo-tx@example.com");
    expect(serialized).not.toMatch(/Bearer\s|\?t=|dedupe|pending/i);
  });
});