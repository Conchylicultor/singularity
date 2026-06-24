import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  FloatingSurface,
  type FloatingSurfaceProps,
} from "./internal/floating-surface";

export default {
  description:
    "Focus-less caret-anchored floating surface: positions a panel against a virtual anchor rect via Floating UI (flip + scroll-follow), reusing ViewportOverlay + Surface, without ever taking focus. A sibling to InlinePopover for transient caret menus.",
  contributions: [],
} satisfies PluginDefinition;
