import { registerMockHandler } from "../adapters/llm/mock.js";
import { CHAT_PROMPT_V1 } from "../phone/chat.js";
import { TRANSLATE_PROMPT_V1 } from "../phone/translate.js";
let registered = false;
export function registerDiagnosisMockHandler(): () => void {
  if (registered) return () => undefined;
  registered = true;
  return registerMockHandler((request) => request.system.startsWith("You are Ellie's diagnosis explainer"), (request) => {
    const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as {
      candidates?: Array<{ key: string; description: string }>;
      evidence?: Array<{ id: string; text: string }>;
    };
    const evidence = payload.evidence ?? [];
    const overdue = evidence.find((entry) => entry.id.startsWith("ev_overdue_"));
    const symptom = evidence.find((entry) => entry.id.startsWith("ev_symptom_"));
    const resolution = evidence.find((entry) => entry.id.startsWith("ev_res_"));
    const warranty = evidence.find((entry) => entry.id === "ev_warranty");
    const citations = [overdue?.id, symptom?.id, resolution?.id, warranty?.id].filter((id): id is string => Boolean(id));
    const explanation = overdue
      ? `Most likely ${payload.candidates?.[0]?.description.toLowerCase() ?? "the overdue part needs attention"} — ${overdue.text}.${[symptom?.text, resolution?.text, warranty?.text].filter(Boolean).length ? ` ${[symptom?.text, resolution?.text, warranty?.text].filter(Boolean).join("; ")}.` : ""}`
      : evidence[0]?.text ? `The history shows ${evidence[0].text}.` : "The history points to the leading listed cause.";
    return JSON.stringify({
      ranking: payload.candidates?.map((candidate) => candidate.key) ?? [],
      explanation,
      citations: citations.length ? citations : evidence.slice(0, 1).map((entry) => entry.id),
    });
  });
}

export function registerPhoneMockHandlers(): () => void {
  const chat = registerMockHandler((request) => request.system === CHAT_PROMPT_V1, (request) => {
    const context = JSON.parse(request.messages.at(-1)?.content ?? "{}") as { evidence?: Array<{ id: string; text: string }>; steps?: Array<{ id: string; text: string }>; parts?: string[]; question?: string };
    const question = context.question?.toLowerCase() ?? "";
    const evidence = context.evidence ?? [];
    const step = context.steps?.[0];
    const proof = evidence[0];
    const text = /part|buy|need/.test(question) && context.parts?.length ? `You'll need ${context.parts.join(", ")}.` : step ? step.text : proof?.text ?? "I'm not sure — please call a technician.";
    const citations = /part|buy|need/.test(question) ? [] : step ? [step.id] : proof ? [proof.id] : [];
    return JSON.stringify({ text, citations });
  });
  const translate = registerMockHandler((request) => request.system === TRANSLATE_PROMPT_V1, (request) => {
    const input = JSON.parse(request.messages.at(-1)?.content ?? "{}") as { fields?: Array<{ path: string; text: string }> };
    return JSON.stringify({ fields: input.fields ?? [] });
  });
  return () => { chat(); translate(); };
}