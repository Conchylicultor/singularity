import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BackupPanel } from "./components/backup-panel";

export const backupPane = Pane.define({
  id: "backup",
  after: [null],
  segment: "debug/backup",
  component: BackupBody,
});

function BackupBody() {
  return (
    <PaneChrome pane={backupPane} title="Backup">
      <BackupPanel />
    </PaneChrome>
  );
}
