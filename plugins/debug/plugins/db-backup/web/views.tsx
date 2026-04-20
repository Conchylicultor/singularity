import type { PaneDescriptor } from "@plugins/shell/web";
import { DbBackupPanel } from "./components/db-backup-panel";

export function dbBackupPane(): PaneDescriptor {
  return { title: "DB Backup", component: DbBackupPanel, path: "/debug/db-backup" };
}
