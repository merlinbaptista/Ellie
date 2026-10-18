export function cleanUtterance(input: string): string {
  return input
    .trim()
    .replace(/^(?:(?:hey|ok|okay)\s+)?alexa[,:]?\s*/i, "")
    .replace(/^ask\s+headsup(?:\s+to)?\s*/i, "")
    .replace(/^tell\s+headsup(?:\s+that)?\s*/i, "")
    .replace(/\b(?:um+|uh+|erm)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
