import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Browser } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { StartPage } from "./components/start-page";

export default {
  description:
    "Browser start page: the empty-state landing shown in the viewport when no URL is loaded — a centered hero (wordmark + search), curated quick links, and the live bookmarks and recents sections.",
  contributions: [Browser.StartPage({ id: "start-page", component: StartPage })],
} satisfies PluginDefinition;
