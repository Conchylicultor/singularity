import type { PluginDefinition } from "@core";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { Debug } from "@plugins/debug/web/slots";
import { MdBackup } from "react-icons/md";
import { dbBackupPane } from "./views";

const dbBackupPlugin: PluginDefinition = {
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
};

export default dbBackupPlugin;
