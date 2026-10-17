export function percentile(values: number[], percent: number): number {
  if (!values.length) throw new Error("Cannot calculate a percentile of an empty sample.");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Percentile must be between 0 and 100.");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export async function eraseThrowawayHousehold(householdId: string, callTool: (name: string, args: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>): Promise<void> {
  const plan = await callTool("forget_household", { householdId });
  if (plan.isError) throw new Error("Could not create throwaway household cleanup confirmation.");
  const content = plan.structuredContent as { speech?: string; followUp?: { retry?: { args?: Record<string, unknown> } } } | undefined;
  const code = content?.speech?.match(/forget everything, ([a-z]+ [a-z]+)/i)?.[1];
  const retry = content?.followUp?.retry?.args;
  if (!code || !retry) throw new Error("The throwaway household cleanup confirmation was incomplete.");
  const erased = await callTool("forget_household", { ...retry, confirmationCode: code });
  if (erased.isError) throw new Error("The throwaway household was not erased.");
}
