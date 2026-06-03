import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useStickyScroll } from "./use-sticky-scroll";
export type {
  StickyScrollHandle,
  UseStickyScrollOptions,
} from "./use-sticky-scroll";
export { JumpToBottomButton } from "./jump-to-bottom-button";
export type { JumpToBottomButtonProps } from "./jump-to-bottom-button";

export default {
  name: "Auto-Scroll",
  description:
    "Stick-to-bottom scroll primitive for streaming surfaces. Hook tracks pin state and detects content growth via ResizeObserver; companion JumpToBottomButton offers an affordance when the user has scrolled up.",
  contributions: [],
} satisfies PluginDefinition;
