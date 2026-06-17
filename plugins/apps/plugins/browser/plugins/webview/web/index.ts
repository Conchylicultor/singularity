import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Browser } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { Viewport } from "./components/viewport";
import { OpenExternal } from "./components/open-external";

export default {
  description:
    "Browser webview: the iframe viewport with a loading bar and start-page fallback, plus an open-in-new-tab chrome action.",
  contributions: [
    Browser.Viewport({ id: "viewport", component: Viewport }),
    Browser.Actions({ id: "open-external", component: OpenExternal }),
  ],
} satisfies PluginDefinition;
