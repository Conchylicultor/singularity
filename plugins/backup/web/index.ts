import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { MdBackup } from "react-icons/md";
import { backupPane, backupRunPane } from "./panes";
import { BackupRunDetail } from "./slots";
import { backupConfig } from "../shared/config";

export { backupPane, backupRunPane } from "./panes";
export { BackupRunDetail } from "./slots";

export default {
  collapsed: true,
  description:
    "Backup orchestrator UI: run backups, view history, and open one run's detail pane — whose sections (what went into the archive, where it was dispatched to, and the Grant access repair for a target that lost its OAuth token) are contributed by the backup arm.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: backupConfig }),
    Pane.Register({ pane: backupPane }),
    Pane.Register({ pane: backupRunPane }),
    DebugApp.Sidebar({
      id: "backup",
      ...sidebarNavItem({
        title: "Backup",
        icon: MdBackup,
        onClick: () => openPane(backupPane, {}, { mode: "root" }),
      }),
    }),
  ],
  slots: {
    ...BackupRunDetail,
    backup: backupPane,
    "backup-run": backupRunPane,
  },
} satisfies PluginDefinition;
