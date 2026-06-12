import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { terminalPane } from "./views";

export default {
  description: "Exposes view factories for terminal panes; no web contributions yet.",
} satisfies PluginDefinition;
