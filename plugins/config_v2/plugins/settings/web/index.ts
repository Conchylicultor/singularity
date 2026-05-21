import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { configNavPane, configDetailPane } from "./internal/panes";

export default {
  id: "config-v2-settings",
  name: "Config v2: Settings",
  description: "Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields.",
  contributions: [
    Pane.Register({ pane: configNavPane }),
    Pane.Register({ pane: configDetailPane }),
    Shell.Sidebar({
      id: "config-v2",
      ...sidebarNavItem({ title: "Config", icon: MdTune, onClick: () => openPane(configNavPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
