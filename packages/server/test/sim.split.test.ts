import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { splitUtterance } from "../src/simulator/split.js";

describe("simulator utterance splitting", () => {
  it("splits the two-action demo utterance in order", async () => {
    const ctx = await createTestContext();
    const pack = ctx.regions.get("IN");
    expect(splitUtterance("the cylinder's changed and the purifier is beeping again", pack).map((part) => part.item?.toLowerCase())).toEqual(["gas cylinder", "water purifier"]);
  });
  it("keeps date ranges and a single item's compound action together", async () => {
    const ctx = await createTestContext();
    const pack = ctx.regions.get("IN");
    expect(splitUtterance("the purifier changed between 3 and 4 weeks ago", pack)).toHaveLength(1);
    expect(splitUtterance("changed it and cleaned the housing", pack)).toHaveLength(1);
  });
  it("inherits the preceding item for a second symptom", async () => {
    const ctx = await createTestContext();
    const parts = splitUtterance("the gas is changed and it's leaking", ctx.regions.get("IN"));
    expect(parts.map((part) => part.item?.toLowerCase())).toEqual(["gas cylinder", "gas cylinder"]);
  });
});
