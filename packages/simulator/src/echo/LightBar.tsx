import type { ReactNode } from "react";
export type LightState = "idle" | "listening" | "thinking" | "speaking" | "awaiting_answer" | "safety_stop" | "not_understood";
export function LightBar({ state }: { state: LightState }): ReactNode { return <div className={`echo-light echo-light--${state}`} aria-hidden="true" />; }
