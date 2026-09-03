import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { RecoveryView } from "./components/recovery-view";

const recoveryRoute = defineRoute({
  id: "conversations-recover",
  segment: "recovery",
});

export const recoveryPane = Pane.define({
  route: recoveryRoute,
  app: debugApp,
  component: RecoveryView,
});
