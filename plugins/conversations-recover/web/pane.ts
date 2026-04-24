import { Pane } from "@plugins/pane/web";
import { RecoveryView } from "./components/recovery-view";

export const recoveryPane = Pane.define({
  id: "conversations-recover",
  path: "/recovery",
  component: RecoveryView,
});
