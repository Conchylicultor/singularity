import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { configNavPane, configDetailPane } from "./internal/panes";

export { configNavPane, configDetailPane } from "./internal/panes";
export { ConfigNav } from "./components/config-nav";
export { ConfigSidebarButton } from "./components/config-sidebar-button";

export default {
  description:
    "Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. Surfaced inside the Settings app.",
  contributions: [
    Pane.Register({ pane: configNavPane }),
    Pane.Register({ pane: configDetailPane }),
  ],
} satisfies PluginDefinition;
