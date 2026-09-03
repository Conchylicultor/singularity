import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { EventsTestView } from "./components/events-test-view";

const eventsTestRoute = defineRoute({
  id: "events-test",
  segment: "events-test",
});

export const eventsTestPane = Pane.define({
  route: eventsTestRoute,
  app: debugApp,
  component: EventsTestView,
});
