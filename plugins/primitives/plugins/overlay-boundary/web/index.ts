import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  OverlayBoundary,
  registerOverlayFallback,
  type OverlayFallbackProps,
} from "./internal/overlay-boundary";

export default {
  description:
    "React-only leaf error boundary for transient overlay content (popover/dialog/dropdown/select/tooltip/floating): OverlayBoundary catches a crash inside overlay content and renders a fallback injected via registerOverlayFallback, so the crash stays contained to the overlay instead of taking down the launching chrome. Sits below ui-kit so it can be wrapped around every *Content without closing the ui-kit → error-boundary cycle.",
  contributions: [],
} satisfies PluginDefinition;
