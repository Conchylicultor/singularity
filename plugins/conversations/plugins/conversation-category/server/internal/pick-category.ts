// Map Haiku's free-form reply to one of the configured category strings.
// Trims whitespace and trailing punctuation, picks the best case-insensitive
// match (exact > prefix > substring). Falls back to the LAST configured entry
// (by convention "Other") when no match — that's documented in the config
// description so users know to keep a catch-all at the end.
export function pickCategory(raw: string, categories: readonly string[]): string {
  if (categories.length === 0) {
    throw new Error("[conversation-category] no categories configured");
  }
  const cleaned = raw
    .trim()
    // strip surrounding quotes the model sometimes adds
    .replace(/^["'`]+|["'`]+$/g, "")
    // strip trailing sentence punctuation
    .replace(/[.!?]+$/g, "")
    .trim()
    .toLowerCase();

  if (!cleaned) return categories[categories.length - 1]!;

  const lowered = categories.map((c) => c.toLowerCase());

  const exactIdx = lowered.indexOf(cleaned);
  if (exactIdx >= 0) return categories[exactIdx]!;

  const prefixIdx = lowered.findIndex((c) => cleaned.startsWith(c));
  if (prefixIdx >= 0) return categories[prefixIdx]!;

  const substrIdx = lowered.findIndex(
    (c) => cleaned.includes(c) || c.includes(cleaned),
  );
  if (substrIdx >= 0) return categories[substrIdx]!;

  return categories[categories.length - 1]!;
}
