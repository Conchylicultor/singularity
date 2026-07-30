/**
 * Generic keywords and system aliases. None names a downloadable face — each
 * asks the browser for a font it already has.
 */
const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "-apple-system",
  "BlinkMacSystemFont",
]);

/**
 * A `var(--font-sans)` entry is a CSS *reference*, not a family name — several
 * imported themes write one, and it was being sent to Google verbatim.
 * Matching any parenthesis also covers the fallback form, since splitting
 * `var(--font-sans, serif)` on commas yields two fragments and neither is a
 * family name. No real family name contains a parenthesis.
 */
const CONTAINS_PAREN = /[()]/;

/**
 * The face a stack actually asks for, or `null` if it asks for nothing
 * downloadable.
 *
 * A font stack is an ordered fallback chain: the first entry is the face the
 * theme wants, and everything after it is what the browser should reach for
 * locally when that face is unavailable. So only the head can ever be worth
 * downloading — fetching a fallback defeats the purpose of declaring one.
 *
 * The head is read *as written*, before any generic filtering, because a
 * leading generic is itself a preference. `ui-monospace, 'Cascadia Mono', Menlo,
 * monospace` asks for the OS monospace face; Cascadia Mono is the Windows
 * fallback, not a request to pull it off a CDN. Promoting the first
 * non-generic entry would download it anyway.
 *
 * Returning `null` rather than `""` keeps "no downloadable face" from being
 * mistaken for a family name.
 */
export function preferredFontFamily(cssFontFamily: string): string | null {
  const head = (cssFontFamily.split(",")[0] ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (head === "" || GENERIC_FAMILIES.has(head) || CONTAINS_PAREN.test(head)) {
    return null;
  }
  return head;
}
