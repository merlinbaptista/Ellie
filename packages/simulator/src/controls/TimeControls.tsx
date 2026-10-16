import type { ReactNode } from "react";
export function TimeControls({ onTravel, onReseed, message }: { onTravel: (mode: "now" | "week" | "day30" | "reset") => void; onReseed: () => void; message?: string }): ReactNode {
  return <section className="time-controls" aria-label="Demo controls"><div className="time-control-buttons"><button onClick={() => onTravel("now")}>Now · 16 Oct</button><button onClick={() => onTravel("week")}>+7 days</button><button onClick={() => onTravel("day30")}>Day 30 · reminder</button><button onClick={() => onTravel("reset")}>Reset clock</button><button className="reseed-button" onClick={onReseed}>Reseed</button></div>{message ? <p role="status">{message}</p> : null}</section>;
}
