import { Pane } from "@plugins/primitives/plugins/pane/web";
import { RecoveryView } from "./components/recovery-view";

export const recoveryPane = Pane.define({
  id: "conversations-recover",
  after: [null],
  segment: "recovery",
  component: RecoveryView,
});
