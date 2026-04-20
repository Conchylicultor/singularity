import type { PluginDefinition } from "@core";

export { terminalPane } from "./views";

export default {
  id: "terminal",
  name: "Terminal",
  description: "Exposes view factories for terminal panes; no web contributions yet.",
} satisfies PluginDefinition;
