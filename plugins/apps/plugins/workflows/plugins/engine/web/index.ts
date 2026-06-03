import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Workflows } from "./slots";

export default {
  name: "Workflows: Engine",
  description: "Core engine infrastructure. Defines the Workflows.StepType slot.",
} satisfies PluginDefinition;
