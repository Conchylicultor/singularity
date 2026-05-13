export interface FuzzyMatch {
  score: number;
  /** [start, end) highlight ranges in the haystack */
  ranges: [start: number, end: number][];
}

export function fuzzyMatch(
  needle: string,
  haystack: string,
): FuzzyMatch | null {
  const nl = needle.toLowerCase();
  const hl = haystack.toLowerCase();

  let score = 0;
  let ni = 0;
  let consecutive = 0;
  const ranges: [number, number][] = [];

  for (let hi = 0; hi < hl.length && ni < nl.length; hi++) {
    if (hl[hi] === nl[ni]) {
      consecutive++;
      score += consecutive; // consecutive bonus
      const prev = haystack[hi - 1];
      if (
        hi === 0 ||
        prev === " " ||
        prev === "-" ||
        prev === "_" ||
        (haystack[hi]! >= "A" && haystack[hi]! <= "Z" && prev! >= "a")
      ) {
        score += 2; // word-boundary bonus
      }

      const last = ranges[ranges.length - 1];
      if (last && last[1] === hi) {
        last[1] = hi + 1;
      } else {
        ranges.push([hi, hi + 1]);
      }
      ni++;
    } else {
      consecutive = 0;
    }
  }

  if (ni < nl.length) return null;
  return { score, ranges };
}
