import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { googleSetupPane } from "./panes";

export { googleSetupPane } from "./panes";

export default {
  description:
    "Interactive setup wizard for Google OAuth credentials. Replaces the Settings redirect with a guided step-by-step pane.",
  contributions: [Pane.Register({ pane: googleSetupPane })],
} satisfies PluginDefinition;
