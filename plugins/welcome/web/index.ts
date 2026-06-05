import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { welcomePane } from "./panes";

export { welcomePane } from "./panes";

export default {
  name: "Welcome",
  description: "Landing pane (agent-manager index) shown at `/agents`.",
  contributions: [Pane.Register({ pane: welcomePane })],
} satisfies PluginDefinition;
