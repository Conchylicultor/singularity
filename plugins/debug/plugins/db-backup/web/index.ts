import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBackup } from "react-icons/md";
import { dbBackupPane } from "./panes";

export { dbBackupPane } from "./panes";

export default {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  contributions: [
    Pane.Register({ pane: dbBackupPane }),
    DebugApp.Sidebar({
      id: "db-backup",
      ...sidebarNavItem({ title: "DB Backup", icon: MdBackup, onClick: () => openPane(dbBackupPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
