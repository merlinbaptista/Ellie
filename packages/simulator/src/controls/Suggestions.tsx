import type { ReactNode } from "react";
export function Suggestions({ items, onSelect }: { items: string[]; onSelect: (text: string) => void }): ReactNode { return <nav className="suggestions" aria-label="Suggested phrases">{items.map((item) => <button key={item} onClick={() => onSelect(item)}>{item}</button>)}</nav>; }
