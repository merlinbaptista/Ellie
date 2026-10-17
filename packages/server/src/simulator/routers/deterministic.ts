import { detectEventType, matchCatalog, matchComponent, matchSymptom, type RegionPack } from "@ellie/schema";
import type { PlannedCall, RouterResult, SimRouterContext } from "./types.js";

function matchedItem(text: string, pack: RegionPack, inherited?: string): { name?: string; catalogKey?: string } {
  const match = matchCatalog(text, pack)[0];
  return match ? { name: match.displayName, catalogKey: match.catalogKey } : inherited ? { name: inherited } : {};
}
function local(speech: string, state: "done" | "not_understood" | "awaiting_answer" = "done"): RouterResult { return { calls: [], kind: "deterministic", ms: 0, localSpeech: speech, state }; }

export function routeDeterministically(fragment: string, pack: RegionPack, context: SimRouterContext): RouterResult {
  const start = performance.now();
  const text = fragment.trim();
  const lower = text.toLowerCase();
  const item = matchedItem(text, pack, /\b(it|that|same one)\b/i.test(text) ? context.lastItem : undefined);
  const args = (extra: Record<string, unknown> = {}) => ({ householdId: context.householdId, ...(item.name ? { item: item.name } : {}), ...extra });
  let call: PlannedCall | undefined;
  if (/\bwhat do you know\b|\bwhat are you storing\b|\bwhat do you remember\b/i.test(lower)) {
    call = { tool: "what_do_you_know", args: { householdId: context.householdId, ...(item.name ? { item: item.name } : {}) }, fragment: text };
  } else if (/\b(forget everything|delete all my data|erase my home)\b/i.test(lower)) {
    call = { tool: "forget_household", args: { householdId: context.householdId }, fragment: text };
  } else if (/\b(forget|delete|stop tracking)\b/i.test(lower) && !/everything|all my data|my home/i.test(lower)) {
    const requestedItem = text.replace(/^.*?\b(?:forget|delete|stop tracking)\s+(?:the\s+)?/i, "").replace(/[.!?]+$/, "").trim() || item.name;
    call = { tool: "forget_item", args: { householdId: context.householdId, item: item.name ?? requestedItem }, fragment: text };
  } else if (/\b(stop texting me|don't send me messages|do not send me messages|unsubscribe)\b/i.test(lower)) {
    call = { tool: "manage_consent", args: { householdId: context.householdId, action: "withdraw", purpose: "phone_messages" }, fragment: text };
  } else if (/\b(you can text me again|text me again|allow messages again)\b/i.test(lower)) {
    call = { tool: "manage_consent", args: { householdId: context.householdId, action: "grant", purpose: "phone_messages" }, fragment: text };
  } else if (/\b(what'?s due|anything due|what do i need to do|this week at home|due this week)\b/i.test(lower)) {
    const days = /this month/i.test(lower) ? 31 : /next two weeks|next 14 days/i.test(lower) ? 14 : undefined;
    call = { tool: "due_this_week", args: { householdId: context.householdId, ...(days ? { days } : {}) }, fragment: text };
  } else if (/\b(when (?:is|will)|when should i change|when .*due|when .*run out)\b/i.test(lower) && item.name) {
    const component = pack.catalog[item.catalogKey ?? ""] ? matchComponent(text, pack.catalog[item.catalogKey!]!) : null;
    call = { tool: "predict_next", args: args(component ? { component: component.key } : {}), fragment: text };
  } else if (/\b(when did i last|history of|how often|show .*history)\b/i.test(lower) && item.name) {
    call = { tool: "get_history", args: args({ period: /this year|past year/i.test(lower) ? "1y" : "90d" }), fragment: text };
  } else if (/\b(send|text)\b.*\b(phone|mobile|cell)\b/i.test(lower)) {
    const contentType = /summary|what'?s due|weekly/i.test(lower) ? "summary" : /book|booking/i.test(lower) ? "booking" : undefined;
    const contextType = context.lastTool === "diagnose" ? "fix" : context.lastTool === "due_this_week" ? "summary" : context.lastTool === "predict_next" ? "booking" : undefined;
    call = { tool: "send_to_phone", args: { householdId: context.householdId, ...(contentType ?? contextType ? { contentType: contentType ?? contextType } : {}), ...(context.lastDiagnosisId && (contentType ?? contextType) === "fix" ? { diagnosisId: context.lastDiagnosisId } : {}), ...(item.name ? { item: item.name } : context.lastItem ? { item: context.lastItem } : {}) }, fragment: text };
    if (!call.args.contentType) return local("Should I send the fix steps or a booking link?", "awaiting_answer");
  } else if (/\b(fixed it|it'?s fixed|that worked|technician fixed)\b/i.test(lower)) {
    const contextFresh = context.lastDiagnosisAt !== undefined && Date.now() - context.lastDiagnosisAt < 30 * 60_000;
    call = { tool: "log_resolution", args: args({ ...(contextFresh && context.lastDiagnosisId ? { diagnosisId: context.lastDiagnosisId } : {}), ...(contextFresh && context.lastCauseKey ? { causeKey: context.lastCauseKey } : {}), fix: text, ...(/technician/i.test(lower) ? { byWhom: "technician" } : {}) }), fragment: text };
  } else if (/\b(i live in|we'?re in|we live in)\b/i.test(lower)) {
    const country = /bengaluru|bangalore|india/i.test(lower) ? "IN" : /texas|united states|\busa\b/i.test(lower) ? "US" : undefined;
    const region = /bengaluru|bangalore/i.test(lower) ? "Bengaluru" : /texas/i.test(lower) ? "Texas" : undefined;
    if (country) call = { tool: "setup_household", args: { householdId: context.householdId, country, region, timeZone: country === "IN" ? "Asia/Kolkata" : "America/Chicago", confirm: true }, fragment: text };
  } else {
    const catalogEntry = pack.catalog[item.catalogKey ?? ""];
    const symptom = catalogEntry ? matchSymptom(text, catalogEntry) : undefined;
    const detectedType = detectEventType(text);
    const eventType = detectedType ?? (/\b(paid|cost|spent|rupees?|dollars?)\b/i.test(text) ? "cost" : null);
    if (item.name && (detectedType === "symptom" || (!detectedType && symptom))) {
      call = { tool: "diagnose", args: args({ symptom: text, ...(symptom ? { answers: {} } : {}) }), fragment: text };
    } else {
      if (item.name && eventType && eventType !== "symptom") {
        const cost = text.match(/(?:\b(?:paid|cost|costs)\s+)(\d+(?:\.\d+)?)/i)?.[1];
        call = { tool: "log_event", args: args({ type: eventType, when: /\b(?:today|yesterday|last \w+|\d+ (?:days?|weeks?|months?) ago|about \w+ weeks? ago)\b/i.exec(text)?.[0], ...(cost ? { cost: Number(cost) } : {}), ...(catalogEntry ? (matchComponent(text, catalogEntry) ? { component: matchComponent(text, catalogEntry)!.key } : {}) : {}) }), fragment: text };
      }
    }
  }
  if (!call && /\b(what can you do|help)\b/i.test(lower)) return { ...local("I remember things at home. Tell me when something's changed, ask what's due, or tell me what's wrong."), ms: Math.round(performance.now() - start) };
  if (!call && /^(yes|sure|please|yeah|yep)\b/i.test(lower) && context.offeredTool) call = { ...context.offeredTool, args: { ...context.offeredTool.args, householdId: context.householdId }, fragment: text };
  if (!call && /^(no|not now)\b/i.test(lower)) return { ...local("Okay."), ms: Math.round(performance.now() - start) };
  if (!call) return { ...local("Sorry, I didn't catch that. You can say things like 'the gas is changed' or 'what's due this week'.", "not_understood"), ms: Math.round(performance.now() - start) };
  return { calls: [call], kind: "deterministic", ms: Math.round(performance.now() - start) };
}
