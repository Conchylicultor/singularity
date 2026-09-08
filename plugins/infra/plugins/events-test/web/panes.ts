import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { EventsTestView } from "./components/events-test-view";

export const eventsTestPane = Pane.define({
  route: defineRoute({
    id: "events-test",
    segment: "events-test",
  }),
  app: debugApp,
  component: EventsTestView,
});
