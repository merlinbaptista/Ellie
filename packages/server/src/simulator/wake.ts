export function cleanUtterance(input: string): string {
  return input
    .trim()
    .replace(/^(?:(?:hey|ok|okay)\s+)?alexa[,:]?\s*/i, "")
    .replace(/^ask\s+ellie(?:\s+to)?\s*/i, "")
    .replace(/^tell\s+ellie(?:\s+that)?\s*/i, "")
    .replace(/\b(?:um+|uh+|erm)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
