import { fillTemplate, warrantyStatus } from "@ellie/schema";
import type { CatalogEntry, FixPlan, Item, Prediction, ResolvedRegionPack } from "@ellie/schema";

export function buildFixPlan(input: {
  causeKey: string;
  item: Item;
  catalog?: CatalogEntry;
  pack: ResolvedRegionPack;
  todayLocal: string;
  prediction?: Prediction;
}): FixPlan | undefined {
  const cause = input.catalog?.symptoms.flatMap((symptom) => symptom.likelyCauses).find((candidate) => candidate.key === input.causeKey);
  if (!cause) return undefined;
  const fix = cause.fix;
  const warrantyState = input.item.warrantyUntil ? warrantyStatus(input.item, input.todayLocal) : { status: "unknown" as const };
  const warrantyLine = (fix?.warrantyRelevant || !cause.diy) && warrantyState.status === "valid" && input.item.warrantyUntil
    ? `Your warranty runs until ${input.item.warrantyUntil} — a service visit may be covered.`
    : undefined;
  const callProIf = [...(fix?.callProIf ?? [])];
  if (warrantyLine) callProIf.unshift(warrantyLine);
  const manualQuery = [input.item.brand, input.item.model, input.catalog?.manualSearchHint ?? input.catalog?.displayName ?? input.item.name, "manual"].filter(Boolean).join(" ");
  const manualUrl = fillTemplate("https://www.google.com/search?q={query}", { query: manualQuery });
  return {
    causeKey: input.causeKey,
    summary: fix?.summary ?? cause.description,
    steps: cause.diy ? fix?.steps ?? [] : [],
    partsNeeded: fix?.partsNeeded ?? [],
    ...(fix?.timeMinutes ? { timeMinutes: fix.timeMinutes } : {}),
    callProIf,
    callProNow: !cause.diy,
    warranty: { status: warrantyState.status, ...(input.item.warrantyUntil ? { until: input.item.warrantyUntil } : {}), relevant: Boolean(fix?.warrantyRelevant || !cause.diy) },
    ...(manualUrl ? { manualUrl } : {}),
    ...(cause.diy && (input.item.kind === "appliance" || /water|power|electrical/i.test((fix?.steps ?? []).join(" "))) ? { safetyNote: "Switch off and unplug before you start." } : {}),
  };
}
