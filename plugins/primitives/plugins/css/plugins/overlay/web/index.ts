import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Overlay,
  OverlayInteractive,
  type OverlayProps,
} from "./internal/overlay";

export default {
  description:
    "In-flow positioning layout primitive: <Overlay behind above clickThrough> paints full-bleed layers under/over its content within its own box, plus the click-through-toggle idiom.",
  contributions: [],
} satisfies PluginDefinition;
