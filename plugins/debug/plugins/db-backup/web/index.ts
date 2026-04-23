import type { PluginDefinition } from "@core";
import { Debug } from "@plugins/debug/web";
import { MdBackup } from "react-icons/md";
import { dbBackupPane } from "./panes";

export { dbBackupPane } from "./panes";

export default {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  contributions: [
    Debug.Item({
      id: "db-backup",
      title: "DB Backup",
      icon: MdBackup,
      onClick: () => dbBackupPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
