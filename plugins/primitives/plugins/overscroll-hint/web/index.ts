import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { OverscrollHintController } from "./internal/overscroll-hint-controller";

export default {
  description:
    "Wasted-scroll hint: a single invisible global controller (mounted via Core.Root) that plays a small native-feeling rubber-band bounce on a surface when a wheel/trackpad/touch gesture scrolls nothing (not scrollable, or already at the edge). Detects 'wasted' gestures by checking whether a real scroll event fired within one animation frame of the gesture.",
  contributions: [Core.Root({ component: OverscrollHintController })],
} satisfies PluginDefinition;
