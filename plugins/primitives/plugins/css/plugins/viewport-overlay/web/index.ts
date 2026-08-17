import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ViewportOverlay,
  type ViewportOverlayProps,
} from "./internal/viewport-overlay";
export {
  assertViewportEscape,
  findViewportBlocker,
  describeElement,
  viewportEscapeReportSink,
  type ViewportBlocker,
  type ViewportBlockerReason,
  type ViewportEscapeFault,
  type ViewportEscapeFaultKind,
  type ViewportEscapeOptions,
} from "./internal/viewport-escape";
export { useViewportEscape } from "./internal/use-viewport-escape";

export default {
  description:
    "Viewport-filling overlay primitive: self-portals to document.body + z-layer + theme-scope so fixed inset-0 fills the real viewport, never a transformed ancestor. Also owns the runtime auditor for the same invariant — the containing-block + stacking-context ancestor walk (assertViewportEscape / useViewportEscape), which reports the two ways a fixed box silently stops being viewport-relative.",
  contributions: [],
} satisfies PluginDefinition;
