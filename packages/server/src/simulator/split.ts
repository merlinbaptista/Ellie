import { matchCatalog, type RegionPack } from "@ellie/schema";

const splitMarker = /\s+(?:and|also|then)\s+|,\s*/i;
const dateAndPattern = /\b(?:between|from)\s+[^,]{0,30}\b\d+\s+and\s+\d+\s+(?:day|week|month)s?\b/i;
const questionWords = /\b(?:when|what|why|how|history|due|send|fixed|smell|alarm)\b/i;
const symptomWords = /\b(?:leaking|beeping|broken|not working|not cooling|no water|smell|alarm)\b/i;

export function splitUtterance(text: string, pack: Pick<RegionPack, "catalog">): Array<{ fragment: string; item?: string }> {
  if (dateAndPattern.test(text)) return [{ fragment: text.trim() }];
  const pieces = text.split(splitMarker).map((fragment) => fragment.trim()).filter(Boolean);
  const fragments: string[] = [];
  for (const piece of pieces) {
    if (!fragments.length || matchCatalog(piece, pack).length || questionWords.test(piece) || symptomWords.test(piece)) fragments.push(piece);
    else fragments[fragments.length - 1] = `${fragments[fragments.length - 1]} and ${piece}`;
  }
  let inheritedItem: string | undefined;
  return fragments.map((fragment) => {
    const matched = matchCatalog(fragment, pack)[0];
    if (matched) inheritedItem = matched.displayName;
    return { fragment, ...(matched?.displayName ?? inheritedItem ? { item: matched?.displayName ?? inheritedItem } : {}) };
  });
}
