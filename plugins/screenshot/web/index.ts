import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import "./panes";
import { ScreenshotButton } from "./components/screenshot-button";

export { screenshotPane } from "./panes";

export default {
  id: "screenshot",
  name: "Screenshot",
  description: "Capture the current page and edit it (crop, draw) in a new tab. Bottom prompt form launches a conversation with the edited screenshot attached.",
  contributions: [
    Shell.Toolbar({ component: ScreenshotButton, group: "actions" }),
  ],
} satisfies PluginDefinition;
