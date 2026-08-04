import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { EventsRoot } from "./components/events-root";
import { EVENTS_APP_PATH } from "./slots";

export const eventsRootPane = Pane.define({
  id: "events-root",
  // Empty segment + `appPath` makes this the Events app's index pane: bare
  // `/events` (basePath-stripped to "/") resolves here instead of the global
  // agent-manager welcome pane. The events surfaces live in the sidebar slot, so
  // this pane is the landing shown before one of them is opened.
  segment: "",
  appPath: EVENTS_APP_PATH,
  component: EventsRootPane,
});

function EventsRootPane(): ReactElement {
  return (
    <PaneChrome pane={eventsRootPane} title="Events">
      <EventsRoot />
    </PaneChrome>
  );
}
