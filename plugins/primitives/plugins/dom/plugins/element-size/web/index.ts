import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useElementSize,
  useResizeObserver,
  type ElementSize,
  type ResizeTarget,
} from "./internal/element-size";

export default {
  description:
    "Element-size ResizeObserver idiom as a primitive: useElementSize(target?) reactively measures an element's size (callback ref, getBoundingClientRect, supports attach-one-node-measure-another via a target getter), and useResizeObserver(target, onResize, {debounce, deps}) is the substrate — synchronous initial measure, RAF-debounced resize callbacks, auto cleanup. The single sanctioned home for the hand-rolled ResizeObserver-for-size idiom.",
  contributions: [],
} satisfies PluginDefinition;
