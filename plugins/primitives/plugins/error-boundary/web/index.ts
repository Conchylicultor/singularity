import { createElement } from "react";
import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";
import { registerOverlayFallback } from "@plugins/primitives/plugins/overlay-boundary/web";
import { ErrorBoundaryMiddleware } from "./internal/error-boundary-middleware";
import { CrashFallback } from "./components/crash-fallback";

export { PluginErrorBoundary } from "./components/plugin-error-boundary";
export { ErrorBoundary } from "./slots";
export { boundaryReportSink } from "./reporter";
export type { BoundaryErrorReport } from "./reporter";

export default {
  description:
    "Generic React error boundary primitive. Wraps plugin contributions so render errors are contained to one slot, with an ErrorBoundary.Action slot for domain-specific buttons (e.g. crash 'Fix') and a boundaryReportSink for opt-in crash reporting.",
  register: [
    {
      register() {
        registerSlotItemMiddleware({
          priority: 100,
          Component: ErrorBoundaryMiddleware,
        });
        // Inject the rich CrashFallback into the overlay-boundary leaf so a crash
        // inside transient overlay content flows through the same reporting +
        // ErrorBoundary.Action infrastructure. The leaf sits below ui-kit, so
        // ui-kit can wrap every *Content without closing the cycle. Uses
        // createElement (not JSX) so the barrel stays a `.ts` folder barrel.
        registerOverlayFallback(({ error, componentStack, retry, kind }) =>
          createElement(CrashFallback, {
            report: { error, componentStack, slot: kind, label: null },
            retry,
          }),
        );
      },
    },
  ],
  contributions: [],
} satisfies PluginDefinition;
