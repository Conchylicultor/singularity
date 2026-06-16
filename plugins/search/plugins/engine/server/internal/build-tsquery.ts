// Build a prefix-aware, injection-safe `to_tsquery` string from raw user input.
//
// Split on whitespace, strip every character outside [A-Za-z0-9_] from each
// term, drop empties, then join the surviving terms with ` & ` and append `:*`
// to each so every term matches as a prefix. Typing `brow` becomes `brow:*`,
// which matches `brown`. Returns `null` when nothing survives sanitization
// (the handler short-circuits to an empty result set).
//
// Because every non-word character is stripped, the output can only ever contain
// `[A-Za-z0-9_]`, spaces, `&`, `:`, and `*` — it is safe to interpolate into
// `to_tsquery('english', …)`.
export function buildPrefixTsQuery(q: string): string | null {
  const terms = q
    .split(/\s+/)
    .map((term) => term.replace(/[^A-Za-z0-9_]/g, ""))
    .filter((term) => term.length > 0);
  if (terms.length === 0) return null;
  return terms.map((term) => `${term}:*`).join(" & ");
}
