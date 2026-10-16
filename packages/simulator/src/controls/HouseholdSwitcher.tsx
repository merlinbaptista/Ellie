import type { ReactNode } from "react";
export function HouseholdSwitcher({ current, onChange, disabled = false }: { current: string; onChange: (id: string) => void; disabled?: boolean }): ReactNode {
  return <label className="control-label">Household<select aria-label="Household" value={current.startsWith("hh_sim-") ? "fresh" : current} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="demo-blr">Bengaluru · en-IN</option><option value="demo-tx">Texas · en-US</option><option value="fresh">Fresh home</option></select></label>;
}
