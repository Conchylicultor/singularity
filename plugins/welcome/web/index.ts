import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { welcomePane } from "./panes";

export { welcomePane } from "./panes";

export default {
  id: "welcome",
  name: "Welcome",
  description: "Landing pane shown at `/`.",
  contributions: [Pane.Register({ pane: welcomePane })],
} satisfies PluginDefinition;
