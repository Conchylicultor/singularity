import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Workflows } from "./slots";

export default {
  id: "workflows-engine",
  name: "Workflows: Engine",
  description: "Core engine infrastructure. Defines the Workflows.StepType slot.",
} satisfies PluginDefinition;
