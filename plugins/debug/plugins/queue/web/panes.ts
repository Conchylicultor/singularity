import { Pane } from "@plugins/pane/web";
import { QueueView } from "./components/queue-view";

export const queuePane = Pane.define({
  id: "queue",
  path: "/debug/queue",
  component: QueueView,
});
