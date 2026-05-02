import type { PluginDefinition } from "@core";

export { PluginErrorBoundary } from "./components/plugin-error-boundary";
export { ErrorBoundary } from "./slots";
export { registerBoundaryReporter } from "./reporter";
export type { BoundaryErrorReport } from "./reporter";

export default {
  id: "error-boundary",
  name: "Error Boundary",
  description:
    "Generic React error boundary primitive. Wraps plugin contributions so render errors are contained to one slot, with an ErrorBoundary.Action slot for domain-specific buttons (e.g. crash 'Fix') and a registerBoundaryReporter() hook for opt-in crash reporting.",
  contributions: [],
} satisfies PluginDefinition;
