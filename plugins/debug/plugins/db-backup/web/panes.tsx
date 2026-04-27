import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { DbBackupPanel } from "./components/db-backup-panel";

export const dbBackupPane = Pane.define({
  id: "db-backup",
  path: "/debug/db-backup",
  component: DbBackupBody,
});

function DbBackupBody() {
  return (
    <PaneChrome pane={dbBackupPane} title="DB Backup">
      <DbBackupPanel />
    </PaneChrome>
  );
}
