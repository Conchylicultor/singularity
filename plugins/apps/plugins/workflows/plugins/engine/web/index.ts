import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Workflows } from "./slots";
export { useStepTypeIndex } from "./internal/use-step-type-index";
export { StepStatusBadge } from "./internal/step-status-badge";
export { StepTraceShell } from "./internal/step-trace-shell";
export { ValueBlock, CollapsibleValue } from "./internal/value-block";

export default {
  description: "Core engine infrastructure. Defines the Workflows.StepType slot.",
} satisfies PluginDefinition;
