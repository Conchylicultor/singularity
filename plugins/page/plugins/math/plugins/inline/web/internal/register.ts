import { registerBlockTextExtension } from "@plugins/page/plugins/editor/web";
import { INLINE_MATH_TOKEN_PATTERN, inlineMathToken } from "../../core";
import {
  $createInlineMathNode,
  $isInlineMathNode,
  InlineMathNode,
} from "../components/inline-math-node";
import { InlineMathPlugin } from "../components/inline-math-plugin";

// Side-effect: teach every block text editor about inline math — the node, how to
// (de)serialize its `\(<latex>\)` token, and the `$$` typeahead plugin.
registerBlockTextExtension({
  id: "inline-math",
  node: InlineMathNode,
  deserializePattern: INLINE_MATH_TOKEN_PATTERN,
  createNodeFromMatch: (m) => $createInlineMathNode(m[1]!),
  serializeNode: (n) => ($isInlineMathNode(n) ? inlineMathToken(n.getExpression()) : null),
  Plugin: InlineMathPlugin,
});
