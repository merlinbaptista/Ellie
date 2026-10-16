import type { Household } from "@ellie/schema";
import type { AppContext } from "../context.js";

export interface PlannedQuestion {
	scope: string;
	field: string;
	question: string;
	defaultValue?: string;
	retry: { tool: string; argName: string; args: Record<string, unknown> };
	attempts?: number;
}

export function planNext(candidates: PlannedQuestion[], household: Pick<Household, "askedFields">): PlannedQuestion | null {
	return candidates.find((candidate) => !household.askedFields.includes(`${candidate.scope}:${candidate.field}`)) ?? null;
}

export async function markAsked(question: PlannedQuestion, ctx: AppContext): Promise<void> {
	const existing = await ctx.repositories.households.get(question.retry.args.householdId as string);
	if (!existing) return;
	const marker = `${question.scope}:${question.field}`;
	if (!existing.askedFields.includes(marker)) await ctx.repositories.households.put({ ...existing, askedFields: [...existing.askedFields, marker] });
}

export async function savePending(householdIdValue: string, question: PlannedQuestion, ctx: AppContext): Promise<void> {
	const attempts = question.attempts ?? 1;
	if (attempts > 2) return;
	await ctx.repositories.pending.put(householdIdValue, { ...question, scope: `${question.scope}:${question.field}`, attempts });
}

export async function consumePending(householdIdValue: string, scope: string, field: string, ctx: AppContext): Promise<PlannedQuestion | null> {
	const key = `${scope}:${field}`;
	const question = await ctx.repositories.pending.get(householdIdValue, key);
	if (question) await ctx.repositories.pending.delete(householdIdValue, key);
	return question;
}
