import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
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
      title: "DB Backup",
      icon: MdBackup,
      onClick: () => dbBackupPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
