import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { BackupPanel } from "./components/backup-panel";

export const backupPane = Pane.define({
  id: "backup",
  app: debugApp,
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
