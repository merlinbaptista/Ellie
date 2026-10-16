export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  const encode = template.startsWith("http");
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_placeholder, key: string) => {
    const value = vars[key];
    if (value === undefined) return `{${key}}`;
    const text = String(value);
    return encode ? encodeURIComponent(text) : text;
  });
}
export function speechList(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
