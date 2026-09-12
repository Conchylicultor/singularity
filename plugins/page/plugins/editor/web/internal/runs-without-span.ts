import { mergeRuns, splitRuns, type RichText } from "../../core";

/**
 * `runs` with the linear span `[from, to)` cut out, marks intact on both sides —
 * the runs-level twin of the content-doc `deleteRange` a menu commit strips its
 * query with (same stored-runs basis, same offsets). `to <= from` cuts nothing.
 */
export function runsWithoutSpan(
  runs: RichText,
  from: number,
  to: number,
): RichText {
  if (to <= from) return runs;
  const [head] = splitRuns(runs, from);
  const [, tail] = splitRuns(runs, to);
  return mergeRuns(head, tail);
}
