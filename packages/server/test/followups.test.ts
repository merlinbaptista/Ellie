import { describe, expect, it } from "vitest";
import { addHousehold, createTestContext } from "./helpers.js";
import { planNext, savePending, consumePending, type PlannedQuestion } from "../src/domain/followups.js";
import { logEvent } from "../src/domain/events.js";

describe("follow-up planner", () => {
  it("plans one unanswered question and never repeats an asked field", async () => {
    const ctx = await createTestContext();
    await addHousehold(ctx, "hh_followup", "IN");
    const household = (await ctx.repositories.households.get("hh_followup"))!;
    const outcome = await logEvent({ householdId: household.householdId, item: "gas", type: "changed" }, ctx);
    const question: PlannedQuestion = { scope: outcome.item.itemId, field: "previousWhen", question: "When was it last changed?", defaultValue: "about 6 weeks ago", retry: { tool: "log_event", argName: "previousWhen", args: { householdId: household.householdId } } };
    expect(planNext([question], household)).toEqual(question);
    const updated = (await ctx.repositories.households.get(household.householdId))!;
    expect(updated.askedFields.some((field) => field.endsWith(":previousWhen"))).toBe(true);
    expect(planNext([question], updated)).toBeNull();
    await savePending(household.householdId, question, ctx);
    expect(await consumePending(household.householdId, question.scope, question.field, ctx)).not.toBeNull();
    expect(await consumePending(household.householdId, question.scope, question.field, ctx)).toBeNull();
  });
});
