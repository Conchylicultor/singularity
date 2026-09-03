import { type ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { eventsApp } from "../core";
import { EventsRoot } from "./components/events-root";

// No segment of its own: an index pane is reached at its app's bare root.
const eventsRootRoute = defineRoute({
  id: "events-root",
  segment: "",
});

export const eventsRootPane = Pane.define({
  route: eventsRootRoute,
  app: eventsApp,
  // The Events app's index/landing pane — what bare `/events` resolves to,
  // instead of the global agent-manager welcome pane. The events surfaces live
  // in the sidebar slot, so this pane is the landing shown before one of them
  // is opened.
  appIndex: true,
  component: EventsRootPane,
});

function EventsRootPane(): ReactElement {
  return (
    <PaneChrome pane={eventsRootPane} title="Events">
      <EventsRoot />
    </PaneChrome>
  );
}
