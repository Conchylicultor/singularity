import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { ConfigSidebarButton } from "@plugins/config_v2/plugins/settings/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";
import { settingsConfigIndexPane } from "./panes";
import { ConfigConflictDot } from "./components/config-conflict-dot";

export default {
  description:
    "Config settings surface: the config nav as the Settings app's default pane, its sidebar entry, and the rail-icon conflict dot.",
  contributions: [
    Pane.Register({ pane: settingsConfigIndexPane }),
    Settings.Sidebar({
      id: "config",
      title: "Config",
      icon: MdTune,
      component: ConfigSidebarButton,
    }),
    Settings.RailBadge({ id: "config-conflicts", component: ConfigConflictDot }),
  ],
} satisfies PluginDefinition;
