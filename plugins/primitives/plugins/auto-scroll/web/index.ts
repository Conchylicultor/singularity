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

export default {
  description:
    "Stick-to-bottom scroll primitive for streaming surfaces. Hook tracks pin state and detects content growth via ResizeObserver; companion JumpToBottomButton offers an affordance when the user has scrolled up.",
  contributions: [],
} satisfies PluginDefinition;
