import { SimTurnResponse, type SimToolCall } from "@ellie/schema";

export interface ResultPart { call: SimToolCall; speech: string; card?: unknown; followUp?: { question: string; defaultValue?: string; retry?: { tool: string; argName: string; args: Record<string, unknown> } }; safety?: { level?: string }; data?: Record<string, unknown> }
export function combineResults(turnId: string, parts: ResultPart[], router: SimTurnResponse["router"], totalMs: number, pending?: { question: string; defaultValue?: string }): SimTurnResponse {
  const safety = parts.find((part) => part.safety?.level === "stop");
  if (safety) return SimTurnResponse.parse({ turnId, speech: safety.speech, cards: safety.card ? [safety.card] : [], state: "safety_stop", calls: [safety.call], router, totalMs, phoneNotified: false });
  const speeches = parts.map((part, index) => {
    const sentences = part.speech.split(/(?<=[.!?])\s+/).filter(Boolean);
    return index < parts.length - 1 ? sentences.filter((sentence) => !/want the steps on your phone|would you like.*phone/i.test(sentence)).join(" ") : part.speech;
  }).filter(Boolean);
  const sentenceCount = () => speeches.reduce((count, speech) => count + speech.split(/(?<=[.!?])\s+/).filter(Boolean).length, 0);
  while (sentenceCount() > 4) {
    let dropped = false;
    for (let index = 0; index < speeches.length - 1; index++) {
      const sentences = speeches[index]!.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length > 1) { sentences.splice(1, 1); speeches[index] = sentences.join(" "); dropped = true; break; }
    }
    if (!dropped) {
      for (let index = 0; index < speeches.length; index++) {
        const sentences = speeches[index]!.split(/(?<=[.!?])\s+/).filter(Boolean);
        if (sentences.length > 1) { sentences.pop(); speeches[index] = sentences.join(" "); dropped = true; break; }
      }
    }
    if (!dropped) break;
  }
  const phoneNotified = parts.some((part) => part.call.tool === "send_to_phone" && ["sent", "queued"].includes(String(part.data?.status)));
  const state = pending ? "awaiting_answer" : "done";
  let speech = speeches.join(" ");
  if (pending && !speech.toLowerCase().includes(pending.question.toLowerCase())) speech = `${speech} ${pending.question}`.trim();
  return SimTurnResponse.parse({ turnId, speech, cards: parts.flatMap((part) => part.card ? [part.card] : []), state, ...(pending ? { followUp: pending } : {}), calls: parts.map((part) => part.call), router, totalMs, phoneNotified });
}
