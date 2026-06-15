import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/register";

export { INLINE_MATH_TOKEN_PATTERN, inlineMathToken } from "../core";

export default {
  description:
    "Inline math: type $$ in any text block to drop a live KaTeX-rendered formula; stored as a \\(latex\\) token, click to edit.",
  contributions: [],
} satisfies PluginDefinition;
