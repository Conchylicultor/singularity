import { Pane } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { queueRoute } from "../core";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  route: queueRoute,
  app: debugApp,
  component: QueueView,
});
