import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { inlineMathToken } from "./tokens";

/**
 * The inline-math token family's ONE declaration. A `type` alias, never an
 * `interface` — see `PageLinkFields` for why.
 */
export type InlineMathFields = { expression: string };

/**
 * `textContent: "empty"` keeps the token out of live root-text reads (the slash
 * menu and the `$$` query scan).
 */
export const inlineMathNode = defineInlineTokenNode<InlineMathFields>({
  type: "inline-math",
  fields: ["expression"],
  token: (fields) => inlineMathToken(fields.expression),
  // Group 1 of `INLINE_MATH_TOKEN_PATTERN` (`./tokens`) is the LaTeX source.
  fieldsOf: (match) => ({ expression: match[1]! }),
  textContent: "empty",
});
