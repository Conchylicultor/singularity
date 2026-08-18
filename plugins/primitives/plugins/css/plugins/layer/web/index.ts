import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Layer,
  layerClasses,
  type LayerProps,
  type LayerOptions,
} from "./internal/layer";

export default {
  description:
    "Full-bleed layer layout primitive: <Layer> / layerClasses() is a standalone absolute inset-0 child of a positioned parent. The element-shaped sibling of Overlay's behind/above props.",
  contributions: [],
} satisfies PluginDefinition;
