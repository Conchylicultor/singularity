import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
export { Shell } from "./slots";
export { Shell as ShellCommands, type ToastVariant, type ToastArgs } from "./commands";

export default {
  id: "shell",
  name: "Shell",
  description:
    "Foundational app layout; defines the slots and commands most other plugins extend.",
  loadBearing: true,
} satisfies PluginDefinition;
