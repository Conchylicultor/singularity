import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { ScreenshotButton } from "./components/screenshot-button";
import { screenshotPane } from "./panes";

export { screenshotPane } from "./panes";
export { captureApp } from "./capture";

export default {
  id: "screenshot",
  name: "Screenshot",
  description: "Capture the current page and edit it (crop, draw) in a new tab. Bottom prompt form launches a conversation with the edited screenshot attached.",
  contributions: [
    Pane.Register({ pane: screenshotPane }),
    Shell.Toolbar({ component: ScreenshotButton, group: "actions" }),
  ],
} satisfies PluginDefinition;
