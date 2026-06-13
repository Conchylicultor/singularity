import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MarkdownEnhancerSlot } from "@plugins/primitives/plugins/markdown/web";
import { InlineTextWalkerSlot } from "@plugins/primitives/plugins/inline-text/web";
import { TextEditorSlots } from "@plugins/primitives/plugins/text-editor/web";

export { ActiveData } from "./slots";
export type { ActiveDataContribution, ActiveDataBlockContribution, ActiveDataInlineContribution, ActiveDataCodeContribution } from "./slots";
export { useActiveDataSegments } from "./internal/segment-active-data";
export type { ActiveDataSegment } from "./internal/segment-active-data";
export { useActiveDataLinkify } from "./internal/linkify-active-data";
export { useActiveDataCodeReplace } from "./internal/use-code-replace";
export type { CodeReplaceContrib } from "./internal/use-code-replace";
export {
  ActiveDataIdentityProvider,
  useActiveDataIdentity,
} from "./internal/identity-context";
export type { ActiveDataIdentity } from "./internal/identity-context";
export { useActiveDataBinding } from "./internal/use-active-data-binding";
export type { ActiveDataBindingHandle } from "./internal/use-active-data-binding";

import { ActiveDataMarkdownEnhancer } from "./internal/markdown-enhancer";
import { ActiveDataInlineWalker } from "./internal/inline-walker";
import { useActiveDataNodeExtensions } from "./internal/node-extension-bridge";

export default {
  collapsed: true,
  description:
    "Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins contribute inline (pattern) or block (tag) renderers; hosts use useActiveDataSegments() + useActiveDataLinkify().",
  contributions: [
    MarkdownEnhancerSlot({
      id: "active-data",
      order: 0,
      Component: ActiveDataMarkdownEnhancer,
    }),
    // Plain-text (non-markdown) counterpart of the markdown enhancer: the same
    // inline-pattern walker, registered into the inline-text pipeline before
    // file-links (order 0). Keeps user-text/task-description chips in sync with
    // the markdown surfaces from one registry.
    InlineTextWalkerSlot({
      id: "active-data",
      order: 0,
      Component: ActiveDataInlineWalker,
    }),
    // Mirror inline tags into the Lexical editor so they render as chips while
    // composing, not just on display.
    TextEditorSlots.NodeExtensions({
      id: "active-data-inline",
      useExtensions: useActiveDataNodeExtensions,
    }),
  ],
} satisfies PluginDefinition;
