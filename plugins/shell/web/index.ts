import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
export { Shell } from "./slots";

export default {
  description:
    "Foundational app layout; defines the slots and commands most other plugins extend.",
  loadBearing: true,
} satisfies PluginDefinition;
