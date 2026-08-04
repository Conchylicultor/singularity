import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Editor } from "@plugins/page/plugins/editor/server";
import { INLINE_MATH_TOKEN_PATTERN } from "../core";

export default {
  description:
    "Inline math token pattern at the server markdown boundary: protects `\\(<latex>\\)` spans from the marks-aware inline scan.",
  contributions: [
    // The same pattern the web extension deserializes with. Load-bearing here
    // more than for any other token: LaTeX is full of `_` and `*`, so an
    // unprotected expression re-parses as emphasis and comes back mangled.
    Editor.InlineToken({ pattern: INLINE_MATH_TOKEN_PATTERN }),
  ],
} satisfies ServerPluginDefinition;
