import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PushDetailBody } from "./components/push-detail";

export const pushDetailPane = Pane.define({
  id: "debug-profiling-push-detail",
  segment: "push-profile/:pushId",
  component: PushDetailBody,
  width: 380,
  resolve: false,
});
