import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DefinitionEditor } from "./components/definition-editor";

export default {
  description:
    "Visual step-graph editor for a workflow definition: add/delete steps, set the entry step, configure per-type config, and wire next/conditional routing on the graph-canvas.",
} satisfies PluginDefinition;
