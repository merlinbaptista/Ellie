import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers.js";
import { routeDeterministically } from "../src/simulator/routers/deterministic.js";
import type { SimRouterContext } from "../src/simulator/routers/types.js";

describe("deterministic simulator router", () => {
  it("routes common IN and US utterances to existing tools and valid args", async () => {
    const ctx = await createTestContext();
    const base: SimRouterContext = { householdId: "demo-blr", language: "en-IN" };
    const cases: Array<[string, string, string, SimRouterContext?]> = [
      ["What's due this week?", "IN", "due_this_week"], ["Anything due?", "IN", "due_this_week"], ["What do I need to do this month?", "IN", "due_this_week"],
      ["When is the gas due?", "IN", "predict_next"], ["When will purifier run out?", "IN", "predict_next"], ["When should I change the sediment filter?", "IN", "predict_next"],
      ["When did I last change the gas?", "IN", "get_history"], ["Show purifier history", "IN", "get_history"], ["How often is the AC serviced?", "IN", "get_history"],
      ["The purifier is beeping again", "IN", "diagnose"], ["The AC isn't cooling", "IN", "diagnose"], ["The water heater has no hot water", "IN", "diagnose"],
      ["The gas cylinder changed", "IN", "log_event"], ["I changed the purifier yesterday", "IN", "log_event"], ["I serviced the AC", "IN", "log_event"],
      ["The cylinder was booked", "IN", "log_event"], ["The gas was delivered", "IN", "log_event"], ["I paid 1250 rupees for AC service", "IN", "log_event"],
      ["It's fixed", "IN", "log_resolution", { ...base, lastDiagnosisId: "dgn_test", lastCauseKey: "filter_overdue", lastItem: "Water purifier" }],
      ["The technician fixed it", "IN", "log_resolution", { ...base, lastDiagnosisId: "dgn_test", lastCauseKey: "filter_overdue", lastItem: "Water purifier" }],
      ["Send the fix steps to my phone", "IN", "send_to_phone", { ...base, lastTool: "diagnose", lastDiagnosisId: "dgn_test", lastItem: "Water purifier" }],
      ["Send this week's summary to my phone", "IN", "send_to_phone"], ["Send it to my phone", "IN", "send_to_phone", { ...base, lastTool: "due_this_week" }],
      ["Help", "IN", "local"], ["No, not now", "IN", "local"], ["Sing me a song", "IN", "not_understood"],
      ["I live in Bengaluru", "IN", "setup_household"], ["We're in Texas", "US", "setup_household"],
      ["The gas tank got refilled", "US", "log_event"], ["The propane tank was changed", "US", "log_event"],
      ["The furnace filter is changed", "US", "log_event"], ["The HVAC is not cooling", "US", "diagnose"],
      ["What's due next two weeks?", "US", "due_this_week"], ["When did I last refill the propane tank?", "US", "get_history"],
    ];
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const [text, region, expected, override] of cases) {
      const pack = ctx.regions.get(region);
      const result = routeDeterministically(text, pack, override ?? { ...base, householdId: region === "US" ? "demo-tx" : "demo-blr", language: region === "US" ? "en-US" : "en-IN" });
      const actual = result.calls[0]?.tool ?? (result.state === "not_understood" ? "not_understood" : "local");
      expect(actual, text).toBe(expected);
      if (result.calls[0]) expect(result.calls[0].args.householdId).toBeDefined();
      if (text.includes("1250 rupees")) { expect(result.calls[0]?.args.type).toBe("cost"); expect(result.calls[0]?.args.cost).toBe(1250); }
      if (text === "The gas tank got refilled") expect(result.calls[0]?.args.item).toMatch(/propane/i);
    }
  });
});
