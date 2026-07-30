/**
 * The Lexical update tag the inline-markdown autoformat stamps on its own
 * transform (`$addUpdateTag(INLINE_FORMAT_TAG)`, inside the discrete update in
 * `inline-format-surgery.ts`).
 *
 * It is its OWN module because two layers need it and neither should pull in
 * the other: the *inline* surgery stamps it, and the *block-level*
 * `markdown-shortcut-plugin` guards on it — the inline transform can strip
 * delimiters and leave a block prefix behind (`~~- foo~~` strikes to `- foo`),
 * a text transition the block plugin would otherwise read as the user typing a
 * bullet marker. Keeping the constant in the surgery module would make that
 * plugin import the whole Lexical surgery layer for one string.
 */
export const INLINE_FORMAT_TAG = "inline-markdown-format";
