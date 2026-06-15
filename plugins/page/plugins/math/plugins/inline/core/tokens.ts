// Inline math is stored as a `\(<latex>\)` token inside a block's plain `data.text`
// string (no schema change). LaTeX-standard inline delimiters are collision-safe:
// prose virtually never contains a literal `\(`, and LaTeX content never contains
// the math delimiters themselves — far safer on reload than `$…$`, which would
// collide with prices like "$5". This is the single source of truth for the token
// format, shared by the web inline node's (de)serialization.

/** Non-global pattern matching one inline math token; group 1 is the LaTeX. */
export const INLINE_MATH_TOKEN_PATTERN = /\\\(([^\n]*?)\\\)/;

/** Serialize a LaTeX expression to its inline token. */
export function inlineMathToken(latex: string): string {
  return `\\(${latex}\\)`;
}
