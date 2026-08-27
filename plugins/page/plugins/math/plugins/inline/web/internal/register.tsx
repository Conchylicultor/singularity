import {
  blockTextTokenExtension,
  registerBlockTextExtension,
} from "@plugins/page/plugins/editor/web";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { INLINE_MATH_TOKEN_PATTERN } from "../../core";
import { inlineMathWebNode } from "../components/inline-math-node";
import { InlineMathPlugin } from "../components/inline-math-plugin";

// Side-effect: teach every block text editor about inline math — the node (whose
// `\(<latex>\)` token format is declared once in `core/node.ts`), the pattern,
// the `$$` typeahead plugin, and how the token paints on a surface that mounts
// no Lexical (page history, diffs, the public site).
registerBlockTextExtension(
  blockTextTokenExtension({
    id: "inline-math",
    node: inlineMathWebNode,
    pattern: INLINE_MATH_TOKEN_PATTERN,
    // Inline LaTeX is full of `_` and `*`, so the inline scan would read a
    // formula as emphasis and corrupt it. This is the case masking exists for.
    markdownSpan: "protect",
    renderToken: ({ expression }) => (
      <KatexMath expression={expression} display={false} />
    ),
    Plugin: InlineMathPlugin,
  }),
);
