import { Pane } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RecoveryView } from "./components/recovery-view";

export const recoveryPane = Pane.define({
  id: "conversations-recover",
  app: debugApp,
  segment: "recovery",
  component: RecoveryView,
});
