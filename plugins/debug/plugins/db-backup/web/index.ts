import type { PluginDefinition } from "@core";
import { ShellCommands } from "@plugins/shell/web";
import { Debug } from "@plugins/debug/web";
import { MdBackup } from "react-icons/md";
import { dbBackupPane } from "./views";

export default {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  contributions: [
    Debug.Item({
      id: "db-backup",
      title: "DB Backup",
      icon: MdBackup,
      onClick: () => ShellCommands.OpenPane(dbBackupPane()),
    }),
  ],
} satisfies PluginDefinition;
