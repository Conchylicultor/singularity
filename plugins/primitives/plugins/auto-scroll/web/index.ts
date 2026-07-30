import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useStickyScroll } from "./use-sticky-scroll";
export type {
  StickyScrollHandle,
  UseStickyScrollOptions,
} from "./use-sticky-scroll";
export { JumpToBottomButton } from "./jump-to-bottom-button";
export type {
  JumpToBottomButtonProps,
  JumpToBottomView,
} from "./jump-to-bottom-button";
export { scrollToBottom } from "./scroll-to-bottom";
export type { ScrollToBottomOptions } from "./scroll-to-bottom";
export { scrollChildIntoView } from "./scroll-child-into-view";
export type {
  ScrollAlign,
  ScrollChildIntoViewOptions,
} from "./scroll-child-into-view";
export { useEdgeAutoScroll } from "./use-edge-auto-scroll";
export type {
  EdgeAutoScroll,
  UseEdgeAutoScrollOptions,
} from "./use-edge-auto-scroll";
export { findScrollParent } from "./internal/find-scroll-parent";
export type { FindScrollParentOptions } from "./internal/find-scroll-parent";

export default {
  description:
    "The scroll-owning primitive: the one sanctioned home for driving a scroll container. Stick-to-bottom streaming (useStickyScroll + JumpToBottomButton), container-scoped scrollToBottom / scrollChildIntoView, gesture-agnostic edge auto-scroll (useEdgeAutoScroll), and the shared findScrollParent discovery.",
  contributions: [],
} satisfies PluginDefinition;
