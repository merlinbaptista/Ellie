import type { SimTurnResponse } from "@ellie/schema";
import type { ReactNode } from "react";
export function Timeline({ turns }: { turns: SimTurnResponse[] }): ReactNode {
  return <section className="timeline" aria-label="Latency timeline"><header><strong>Turn latency</strong><span>500 ms budget</span></header>{turns.slice(-10).map((turn) => <div className="timeline-row" key={turn.turnId}><span className="timeline-label">{turn.router.kind} · {turn.totalMs} ms</span><div className="timeline-track"><i className="timeline-budget" />{turn.calls.map((call, index) => <i className={`timeline-bar${call.ms > 500 ? " timeline-bar--slow" : ""}`} key={`${turn.turnId}-${index}`} style={{ width: `${Math.max(2, Math.min(100, call.ms / 10))}%` }} title={`${call.tool} ${call.ms} ms`} />)}</div></div>)}</section>;
}
