import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { ScreenshotButton } from "./components/screenshot-button";
import { screenshotPane } from "./views";

const screenshotPlugin: PluginDefinition = {
  id: "screenshot",
  name: "Screenshot",
  description: "Capture the current page and edit it (crop, draw) in a new tab.",
  contributions: [
    Shell.Toolbar({ component: ScreenshotButton, group: "actions" }),
    Shell.Route({
      pattern: "/screenshot/:id",
      resolve: (params) => screenshotPane({ id: params.id! }),
    }),
  ],
};

export default screenshotPlugin;
