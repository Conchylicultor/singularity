import { tagKey } from "./tag-color";

/**
 * The vocabulary names closest to `name`, best first — what a refusal of an
 * unknown tag offers ("did you mean …"). Ranked by edit distance between the
 * normalized keys, with a containment bonus so `progress` finds `In progress`.
 * Only names within reach are returned; an unrelated name gets none.
 */
export function closestTagNames(
  name: string,
  vocabulary: readonly string[],
  limit = 3,
): string[] {
  const key = tagKey(name);
  const scored = vocabulary.map((candidate) => {
    const other = tagKey(candidate);
    const contains = other.includes(key) || key.includes(other);
    const distance = levenshtein(key, other);
    const score = contains ? 0 : distance / Math.max(key.length, other.length);
    return { candidate, score };
  });
  return scored
    .filter((s) => s.score <= 0.5)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.candidate);
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}
