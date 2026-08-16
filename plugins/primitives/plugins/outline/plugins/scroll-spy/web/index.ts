import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useActiveInView } from "./internal/use-active-in-view";

export default {
  description:
    "Which section of a scrolling document the reader is looking at: useActiveInView(ids, resolve) watches the resolved elements through ONE IntersectionObserver biased to the top third of the scroller, answers with the first id in order that is on screen, holds the last answer while nothing is, and enrolls elements incrementally as they mount.",
  contributions: [],
} satisfies PluginDefinition;
