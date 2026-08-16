import { Pane } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { EventsTestView } from "./components/events-test-view";

export const eventsTestPane = Pane.define({
  id: "events-test",
  app: debugApp,
  segment: "events-test",
  component: EventsTestView,
});
