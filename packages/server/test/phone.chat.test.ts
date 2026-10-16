import { describe, expect, it, vi } from "vitest";
import { diagnose } from "../src/domain/diagnose.js";
import { postPhoneChat, getPhoneChat } from "../src/phone/chat.js";
import { signPhoneLink } from "../src/links/sign.js";
import { seedDemo } from "../src/seed/seed.js";
import { createTestContext } from "./helpers.js";
import { clearMockHandlers } from "../src/adapters/llm/mock.js";
import { linkPk, phoneChatCountSk } from "../src/data/keys.js";
import { afterEach } from "vitest";

afterEach(() => clearMockHandlers());
describe("phone repair chat", () => {
  it("answers parts deterministically and refuses out-of-scope questions", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const result = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const token = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: result.diagnosis.diagnosisId, env: ctx.env }).payload;
    const parts = await postPhoneChat(ctx, token, { message: "What do I need?" });
    expect(parts.reply.text).toContain("sediment filter cartridge");
    expect(parts.reply.source).toBe("deterministic");
    const nextStep = await postPhoneChat(ctx, token, { message: "What next?", ticked: [0] });
    expect(nextStep.reply.citedEvidenceIds).toContain("step_2");
    const duration = await postPhoneChat(ctx, token, { message: "How long?" });
    expect(duration.reply.text).toContain("15 minutes");
    expect(duration.reply.citedEvidenceIds).toContain("fix_time");
    const warranty = await postPhoneChat(ctx, token, { message: "Is it under warranty?" });
    expect(warranty.reply.citedEvidenceIds).toContain("ev_warranty");
    const professional = await postPhoneChat(ctx, token, { message: "Should I call a technician?" });
    expect(professional.reply.citedEvidenceIds).toContain("call_pro_1");
    const cause = await postPhoneChat(ctx, token, { message: "Why is it beeping?" });
    expect(cause.reply.citedEvidenceIds.length).toBeGreaterThan(0);
    const outside = await postPhoneChat(ctx, token, { message: "What's the weather?" });
    expect(outside.reply.text).toContain("I can only help with this water purifier fix");
    expect((await getPhoneChat(ctx, token)).length).toBe(14);
  });

  it("runs the safety gate first and disables the session after a gas smell", async () => {
    const ctx = await createTestContext();
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const diagnosis = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const token = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: diagnosis.diagnosis.diagnosisId, env: ctx.env }).payload;
    const complete = vi.fn(async () => { throw new Error("must not call LLM after safety hit"); });
    (ctx as unknown as { llm: { complete: typeof complete } }).llm = { complete };
    const result = await postPhoneChat(ctx, token, { message: "I can smell gas" });
    expect(result.safety).toEqual({ level: "stop", number: "1906" });
    expect(result.reply.source).toBe("safety");
    expect(complete).not.toHaveBeenCalled();
    await expect(postPhoneChat(ctx, token, { message: "What next?" })).rejects.toBeInstanceOf(Error);
    expect((await getPhoneChat(ctx, token)).at(-1)?.source).toBe("safety");
  });

  it("sends a redacted, scoped context and validates citations from LLM answers", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const result = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const token = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: result.diagnosis.diagnosisId, env: ctx.env }).payload;
    let prompt = "";
    (ctx as unknown as { llm: { name: string; complete: (request: { messages: Array<{ content: string }> }) => Promise<{ text: string; model: string; latencyMs: number; mock: boolean }> } }).llm = {
      name: "bedrock",
      complete: async (request) => {
        prompt = request.messages[0]!.content;
        const context = JSON.parse(prompt) as { steps: Array<{ id: string }> };
        return { text: JSON.stringify({ text: "Switch off and unplug the purifier.", citations: [context.steps[0]?.id] }), model: "test", latencyMs: 1, mock: false };
      },
    };
    const answer = await postPhoneChat(ctx, token, { message: "Should I try something? My name is Pat. email test@example.com phone +1 212 555 0199" });
    expect(answer.reply.source).toBe("llm");
    expect(prompt).not.toContain("demo-blr");
    expect(prompt).not.toContain("test@example.com");
    expect(prompt).not.toContain("212 555 0199");
    expect(prompt).not.toContain("Pat");
    const sent = JSON.parse(prompt) as { question: string; conversation: Array<{ role: string; text: string }> };
    expect(sent.question).toContain("Should I try something?");
    expect(sent.conversation.some((message) => message.role === "user" && message.text === sent.question)).toBe(true);
  });

  it("caps a link at twenty user turns and stores chat counters with wall TTL", async () => {
    const ctx = await createTestContext("2026-10-16T03:30:00.000Z");
    await seedDemo(ctx, { reset: true, anchorLocal: "2026-10-16" });
    const result = await diagnose(ctx, { householdId: "demo-blr", item: "purifier", symptom: "beeping again" });
    const token = signPhoneLink({ householdId: "demo-blr", kind: "fix", ref: result.diagnosis.diagnosisId, env: ctx.env }).payload;
    for (let turn = 0; turn < 20; turn++) await postPhoneChat(ctx, token, { message: "What's the weather?" });
    await expect(postPhoneChat(ctx, token, { message: "One more" })).rejects.toMatchObject({ name: "ChatLimitError" });
    const count = await ctx.storage.get(linkPk(), phoneChatCountSk(token.nonce));
    expect(count?.ttlClock).toBe("wall");
    expect(await getPhoneChat(ctx, token)).toHaveLength(40);
  });
});
