import { Pane } from "@plugins/pane/web";
import { DbBackupPanel } from "./components/db-backup-panel";

export const dbBackupPane = Pane.define({
  id: "db-backup",
  path: "/debug/db-backup",
  component: DbBackupPanel,
});
