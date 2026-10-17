export type PresenterAction =
  | { kind: "say"; text: string }
  | { kind: "timeTravel"; to: string | null }
  | { kind: "openPhone"; which: "latest" }
  | { kind: "phoneTap"; action: "fixed" | "booked" | "book" }
  | { kind: "reseed" };

export interface PresenterStep {
  id: string;
  title: string;
  household: "demo-blr" | "demo-tx" | "fresh";
  action: PresenterAction;
  expect?: {
    tools?: string[];
    speechIncludes?: string[];
    speechExcludes?: string[];
    state?: "done" | "awaiting_answer" | "safety_stop" | "not_understood";
    cards?: number;
    maxToolMs?: number;
    outboxNew?: number;
  };
  presenterNote?: string;
  hidden?: boolean;
}

export function presenterAllowed(production: boolean, hasAccessCode: boolean): boolean {
  return !production || hasAccessCode;
}
