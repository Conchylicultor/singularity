/** The local calendar day of `ms`, `YYYY-MM-DD` (the user's timezone). */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The instant of the next local midnight after `ms`. */
function nextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/**
 * `[start, end)` cut at every local midnight it crosses: one `{ day, ms }` per
 * local day the span touches, in order. An empty or inverted span yields none.
 */
export function splitByLocalDay(
  start: number,
  end: number,
): { day: string; ms: number }[] {
  const out: { day: string; ms: number }[] = [];
  let from = start;
  while (from < end) {
    const to = Math.min(end, nextLocalMidnight(from));
    out.push({ day: localDay(from), ms: to - from });
    from = to;
  }
  return out;
}
