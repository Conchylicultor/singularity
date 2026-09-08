import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  route: defineRoute({ id: "queue", segment: "queue" }),
  app: debugApp,
  component: QueueView,
});
