import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { configNavPane, configDetailPane } from "./internal/panes";
import { ConfigSidebarButton } from "./components/config-sidebar-button";

export { configNavPane, configDetailPane } from "./internal/panes";

export default {
  name: "Config v2: Settings",
  description: "Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields.",
  contributions: [
    Pane.Register({ pane: configNavPane }),
    Pane.Register({ pane: configDetailPane }),
    Shell.Sidebar({
      id: "config-v2",
      title: "Config",
      icon: MdTune,
      component: ConfigSidebarButton,
    }),
  ],
} satisfies PluginDefinition;
