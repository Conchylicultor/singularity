import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { googleSetupPane } from "./panes";

export { googleSetupPane } from "./panes";

export default {
  id: "auth-google-setup-wizard",
  name: "Auth: Google Setup Wizard",
  description:
    "Interactive setup wizard for Google OAuth credentials. Replaces the Settings redirect with a guided step-by-step pane.",
  contributions: [Pane.Register({ pane: googleSetupPane })],
} satisfies PluginDefinition;
