import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { ScreenshotButton } from "./components/screenshot-button";
import { screenshotPane } from "./views";

export default {
  id: "screenshot",
  name: "Screenshot",
  description: "Capture the current page and edit it (crop, draw) in a new tab. Bottom prompt form launches a conversation with the edited screenshot attached.",
  contributions: [
    Shell.Toolbar({ component: ScreenshotButton, group: "actions" }),
    Shell.Route({
      pattern: "/screenshot/:id",
      resolve: (params) => screenshotPane({ id: params.id! }),
    }),
  ],
} satisfies PluginDefinition;
