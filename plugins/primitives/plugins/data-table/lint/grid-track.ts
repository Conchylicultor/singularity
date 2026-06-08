// A single CSS grid track size, as fed into `grid-template-columns` by the
// data-table primitive. Accept the forms the data-table actually uses; reject
// Tailwind classes and other non-track strings.
export function isGridTrackSize(raw: string): boolean {
  const v = raw.trim();
  if (v === "") return false;
  if (["auto", "min-content", "max-content", "0"].includes(v)) return true;
  // <length-percentage> | <flex>  e.g. 12rem, 200px, 3.5rem, 50%, 1fr, 1.2fr
  if (/^[0-9]*\.?[0-9]+(fr|px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in|q)$/i.test(v))
    return true;
  // function tracks: minmax(...), fit-content(...), calc/clamp/min/max(...)
  if (/^(minmax|fit-content|calc|clamp|min|max)\(.*\)$/.test(v)) return true;
  return false;
}
