import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  createInViewWatcher,
  useInView,
  type InViewOptions,
  type InViewRoot,
  type InViewTarget,
  type InViewWatcher,
} from "./internal/in-view";

export default {
  description:
    "The one sanctioned home for new IntersectionObserver: createInViewWatcher(onChange, options) is the DOM layer, owning the WeakSet enrollment rule so a re-enrollment pass costs nothing, and useInView(target, onChange, {deps}) is the React layer — observes one element, hands the most recent entry of each batch to a stabilised callback, and rebuilds the observer only when deps change (the rebuild is what re-delivers against a still-intersecting element).",
  contributions: [],
} satisfies PluginDefinition;
