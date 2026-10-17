import { randomUUID } from "node:crypto";
import { detectEventType, matchCatalog, type SimTurnRequest, type SimTurnResponse } from "@ellie/schema";
import type { AppContext } from "../context.js";
import { checkSafety } from "../diagnosis/safety.js";
import { combineResults, type ResultPart } from "./combine.js";
import { LoopbackMcpClient } from "./mcpClient.js";
import { clearPending, type PendingFollowUp, type SimSession } from "./session.js";
import { routeWithBedrock } from "./routers/bedrock.js";
import { routeDeterministically } from "./routers/deterministic.js";
import type { PlannedCall, RouterResult, SimRouterContext } from "./routers/types.js";
import { cleanUtterance } from "./wake.js";
import { splitUtterance } from "./split.js";

function structured(result: { structuredContent?: unknown; content?: Array<{ type: string; text?: string }>; isError?: boolean }): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent as Record<string, unknown>;
  const json = result.content?.find((part) => part.type === "text")?.text;
  if (json) { try { const parsed: unknown = JSON.parse(json); if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>; } catch { return { speech: json }; } }
  return { speech: "Sorry, something went wrong on my side. Please try again.", isError: true };
}
function followUpFrom(value: unknown): PendingFollowUp | undefined {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  const retry = object.retry as PendingFollowUp["retry"] | undefined;
  if (typeof object.question !== "string" || !retry) return;
  return { question: object.question, retry, ...(typeof object.defaultValue === "string" ? { defaultValue: object.defaultValue } : {}), askedAt: Date.now() };
}
export function answerForPending(text: string, pending: PendingFollowUp): unknown {
  const normalized = text.trim().toLowerCase();
  if (/^(?:i'?m )?(?:not sure|don't know|do not know|no idea)$/.test(normalized) && pending.defaultValue !== undefined) return pending.defaultValue;
  if (pending.retry.argName === "contentType") {
    if (/\b(fix|steps)\b/.test(normalized)) return "fix";
    if (/\b(book|booking|link)\b/.test(normalized)) return "booking";
    if (/\b(summary|due)\b/.test(normalized)) return "summary";
  }
  if (pending.retry.argName === "confirm" || pending.retry.argName === "consent") {
    if (/^(yes|yeah|yep|sure|please)$/.test(normalized)) return true;
    if (/^(no|nope|not now)$/.test(normalized)) return false;
  }
  return text.trim();
}
function updateContext(session: SimSession, tool: string, result: Record<string, unknown>): void {
  session.lastTool = tool;
  const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const handled = result.speech && typeof result.speech === "object" ? result.speech as Record<string, unknown> : undefined;
  if (typeof data.itemName === "string") session.lastItem = data.itemName;
  if (typeof data.item === "string") session.lastItem = data.item;
    if (data.item && typeof data.item === "object" && typeof (data.item as Record<string, unknown>).name === "string") session.lastItem = String((data.item as Record<string, unknown>).name);
  if (typeof handled?.item === "string") session.lastItem = handled.item;
  if (typeof handled?.itemName === "string") session.lastItem = handled.itemName;
  if (tool === "diagnose") {
    const diagnosis = data.diagnosis && typeof data.diagnosis === "object" ? data.diagnosis as Record<string, unknown> : data;
    if (typeof diagnosis.diagnosisId === "string") session.lastDiagnosisId = diagnosis.diagnosisId;
    const candidate = Array.isArray(diagnosis.candidates) ? diagnosis.candidates[0] as Record<string, unknown> | undefined : undefined;
    if (typeof candidate?.causeKey === "string") session.lastCauseKey = candidate.causeKey;
    session.lastDiagnosisAt = Date.now();
  }
  const follow = followUpFrom(result.followUp);
  if (follow) {
    if (!session.pending) session.pending = follow;
    else session.queued.push(follow);
  }
  const offer = result.card && typeof result.card === "object" ? (result.card as Record<string, unknown>).actions : undefined;
  if (Array.isArray(offer)) {
    const action = offer.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).tool === "string") as Record<string, unknown> | undefined;
    if (action) session.offeredTool = { tool: String(action.tool), args: (action.args as Record<string, unknown>) ?? {}, fragment: "yes" };
  }
}
function localResponse(text: string, state: "done" | "not_understood" | "awaiting_answer", started: number, followUp?: { question: string; defaultValue?: string }): SimTurnResponse {
  return { turnId: randomUUID(), speech: text, cards: [], state, ...(followUp ? { followUp } : {}), calls: [], router: { kind: "deterministic", ms: 0 }, totalMs: Math.round(performance.now() - started), phoneNotified: false };
}

export async function runTurn(ctx: AppContext, session: SimSession, request: SimTurnRequest, baseUrl: string): Promise<SimTurnResponse> {
  const started = performance.now();
  const utterance = cleanUtterance(request.text);
  if (!utterance) return localResponse("Yes?", "awaiting_answer", started);
  if (session.householdId !== request.householdId) { session.householdId = request.householdId; clearPending(session); }
  const household = await ctx.repositories.households.get(session.householdId);
  const pack = ctx.regions.get(household?.regionPackId ?? "DEFAULT");
  session.mcp ??= new LoopbackMcpClient(baseUrl);
  const mcp = session.mcp;
  const safety = checkSafety(utterance, undefined, pack);
  const safetyMatch = matchCatalog(utterance, pack)[0];
  let routed: RouterResult;
  if (safety) routed = { calls: [{ tool: "diagnose", args: { householdId: session.householdId, item: safetyMatch?.displayName ?? "home", symptom: utterance }, fragment: utterance }], kind: "deterministic", ms: 0 };
  else {
    const simContext: SimRouterContext = { householdId: session.householdId, ...(session.lastItem ? { lastItem: session.lastItem } : {}), ...(session.lastDiagnosisId ? { lastDiagnosisId: session.lastDiagnosisId } : {}), ...(session.lastCauseKey ? { lastCauseKey: session.lastCauseKey } : {}), ...(session.lastTool ? { lastTool: session.lastTool } : {}), ...(session.offeredTool ? { offeredTool: session.offeredTool } : {}), ...(session.lastDiagnosisAt ? { lastDiagnosisAt: session.lastDiagnosisAt } : {}), language: request.lang, privateValues: [household?.displayName, household?.region, session.lastItem].filter((value): value is string => Boolean(value)) };
    const useLlm = ctx.env.SIM_ROUTER === "llm" || (ctx.env.SIM_ROUTER === "auto" && ctx.llm.name === "bedrock");
    if (useLlm) {
      routed = await routeWithBedrock(ctx, mcp, utterance, session.history, simContext);
      if (!routed.calls.length) {
        const fallback = routeDeterministically(utterance, pack, simContext);
        routed = { ...fallback, kind: "deterministic", fallbackReason: routed.fallbackReason };
      }
    } else {
      const fragments = splitUtterance(utterance, pack);
      const calls: PlannedCall[] = [];
      let localSpeech: RouterResult | undefined;
      for (const fragment of fragments) {
        const plan = routeDeterministically(fragment.fragment, pack, { ...simContext, ...(fragment.item ? { lastItem: fragment.item } : {}) });
        if (plan.calls.length) calls.push(...plan.calls);
        else if (plan.localSpeech) { localSpeech = plan; if (plan.state === "awaiting_answer" || plan.state === "not_understood") break; }
      }
      routed = localSpeech && !calls.length ? localSpeech : { calls: calls.slice(0, ctx.env.SIM_MAX_TOOL_CALLS), kind: "deterministic", ms: Math.round(performance.now() - started) };
    }
  }

  let calls = routed.calls;
  const activePending = session.pending;
  const clearlyNewRequest = /^(what'?s due|what do i need|help|i live in|we'?re in)\b/i.test(utterance) || (matchCatalog(utterance, pack).length > 0 && detectEventType(utterance) !== null);
  if (!safety && activePending && Date.now() - activePending.askedAt <= 120_000 && !clearlyNewRequest) {
    const retry = { ...activePending.retry, args: { ...activePending.retry.args, [activePending.retry.argName]: answerForPending(utterance, activePending), householdId: session.householdId } };
    clearPending(session);
    calls = [{ tool: retry.tool, args: retry.args, fragment: utterance }];
  } else if (activePending && (clearlyNewRequest || Date.now() - activePending.askedAt > 120_000 || safety)) clearPending(session);

  if (!calls.length) {
    const speech = routed.localSpeech ?? "Sorry, I didn't catch that. You can say things like 'the gas is changed' or 'what's due this week'.";
    const state = routed.state ?? "not_understood";
    const clarification = speech === "Should I send the fix steps or a booking link?";
    if (clarification) session.pending = { question: speech, defaultValue: "fix", retry: { tool: "send_to_phone", argName: "contentType", args: { householdId: session.householdId, ...(session.lastItem ? { item: session.lastItem } : {}), ...(session.lastDiagnosisId ? { diagnosisId: session.lastDiagnosisId } : {}) } }, askedAt: Date.now() };
    const response = localResponse(speech, state, started, clarification ? { question: speech, defaultValue: "fix" } : undefined);
    response.router = { kind: routed.kind, ms: routed.ms, ...(routed.fallbackReason ? { fallbackReason: routed.fallbackReason } : {}) };
    session.history.push({ user: utterance, speech });
    session.history = session.history.slice(-8);
    return response;
  }

  const parts: ResultPart[] = [];
  for (const planned of calls.slice(0, ctx.env.SIM_MAX_TOOL_CALLS)) {
    const args = { ...planned.args, householdId: session.householdId };
    const callStarted = performance.now();
    let raw: Awaited<ReturnType<typeof mcp.callTool>>;
    try { raw = await mcp.callTool(planned.tool, args); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed";
      const call = { tool: planned.tool, args, ms: Math.round(performance.now() - callStarted), ok: false, result: { error: message }, fragment: planned.fragment };
      parts.push({ call, speech: "Sorry, something went wrong on my side. Please try again." });
      continue;
    }
    const value = structured(raw);
    const call = { tool: planned.tool, args, ms: Math.round(performance.now() - callStarted), ok: !raw.isError, result: value, fragment: planned.fragment };
    const data = value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : undefined;
    const follow = followUpFrom(value.followUp);
    updateContext(session, planned.tool, value);
    if (planned.tool === "forget_household" && (value.data as Record<string, unknown> | undefined)?.scope === "household") {
      session.lastItem = undefined; session.lastDiagnosisId = undefined; session.lastCauseKey = undefined; session.lastTool = undefined; session.offeredTool = undefined; session.history = [];
    }
    parts.push({ call, speech: typeof value.speech === "string" ? value.speech : raw.content?.find((piece) => piece.type === "text")?.text ?? "", ...(value.card ? { card: value.card } : {}), ...(follow ? { followUp: follow } : {}), ...(value.safety && typeof value.safety === "object" ? { safety: value.safety as { level?: string } } : {}), ...(data ? { data } : {}) });
    if (safety) break;
  }
  if (!session.pending && session.queued.length) session.pending = session.queued.shift();
  const pending = session.pending ? { question: session.pending.question, ...(session.pending.defaultValue ? { defaultValue: session.pending.defaultValue } : {}) } : undefined;
  const response = combineResults(randomUUID(), parts, { kind: routed.kind, ms: routed.ms, ...(routed.fallbackReason ? { fallbackReason: routed.fallbackReason } : {}) }, Math.round(performance.now() - started), pending);
  session.history.push({ user: utterance, speech: response.speech });
  session.history = session.history.slice(-8);
  return response;
}
