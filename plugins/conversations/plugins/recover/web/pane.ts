import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RecoveryView } from "./components/recovery-view";

export const recoveryPane = Pane.define({
  route: defineRoute({
    id: "conversations-recover",
    segment: "recovery",
  }),
  app: debugApp,
  component: RecoveryView,
});
