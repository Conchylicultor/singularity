import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";
import { ErrorBoundaryMiddleware } from "./internal/error-boundary-middleware";

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
      },
    },
  ],
  contributions: [],
} satisfies PluginDefinition;
