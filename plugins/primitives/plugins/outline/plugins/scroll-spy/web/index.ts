import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useActiveInView,
  type ReadingPosition,
} from "./internal/use-active-in-view";

export default {
  description:
    "Where the reader is in a scrolling document: useActiveInView(ids, resolve, {position}) watches the resolved elements through ONE in-view watcher and answers with either the section being read (the first id in the top third of the scroller) or how far the reader has got (the last id anywhere on screen). Holds the last answer while nothing is on screen, and enrolls elements incrementally as they mount.",
  contributions: [],
} satisfies PluginDefinition;
