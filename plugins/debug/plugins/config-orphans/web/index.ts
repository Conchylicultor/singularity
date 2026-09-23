import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { MdRuleFolder } from "react-icons/md";
import { ConfigNavSlots } from "@plugins/config_v2/plugins/settings/web";
import { configOrphansPane } from "./panes";
import { StrandedConfigNotice } from "./components/stranded-config-notice";

export { configOrphansPane } from "./panes";

export default {
  description:
    "Read-only audit of orphaned user-layer config files whose defineConfig descriptor is no longer live, plus a notice pinned above Settings → Config when any of the user's own saved settings no longer apply.",
  contributions: [
    Pane.Register({ pane: configOrphansPane }),
    DebugApp.Sidebar({
      id: "config-orphans",
      title: "Config Orphans",
      icon: MdRuleFolder,
      onClick: () => openPane(configOrphansPane, {}, { mode: "root" }),
    }),
    ConfigNavSlots.Notice({
      id: "stranded-config",
      component: StrandedConfigNotice,
    }),
  ],
  slots: { "config-orphans": configOrphansPane },
} satisfies PluginDefinition;
