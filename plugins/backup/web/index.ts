import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { MdBackup } from "react-icons/md";
import { backupPane } from "./panes";
import { backupConfig } from "../shared/config";

export { backupPane } from "./panes";

export default {
  id: "backup",
  name: "Backup",
  description:
    "Backup orchestrator UI: run backups, view history, configure targets.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: backupConfig }),
    Pane.Register({ pane: backupPane }),
    DebugApp.Sidebar({
      id: "backup",
      ...sidebarNavItem({ title: "Backup", icon: MdBackup, onClick: () => openPane(backupPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
