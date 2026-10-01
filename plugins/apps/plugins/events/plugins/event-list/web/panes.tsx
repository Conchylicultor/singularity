import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import {
  DataView,
  defineDataView,
  liveDataSource,
} from "@plugins/primitives/plugins/data-view/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { eventsApp } from "@plugins/apps/plugins/events/plugins/shell/core";
import {
  externalUrl,
  type ListedEvent,
  type SourcedEvent,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import { EVENT_LIST_SEARCHABLE, eventsList } from "../core";
import { eventFieldDefs } from "./internal/fields";
import { useOpenEvent } from "./internal/use-open-event";
import { EventRow } from "./components/event-row";
import { EventList } from "./slots";

/**
 * The Events surface id. Config-backed like every DataView: the view instances
 * (`Upcoming`, `All`, `By category`, …) live ONLY in
 * `config/apps/events/event-list/events.list.jsonc` — there is no
 * code-synthesized default, by design. It IS `eventsList`'s column scope
 * (asserted at mount): the surface whose custom columns sort and filter it.
 */
const EVENTS_LIST_VIEW = defineDataView("events.list");

/**
 * The live source: the `events.list` collection, kept fresh by the routed change
 * feed (an event write, a source's type / config / enabled flip) with no tick
 * and no refetch. The search box matches what an event is and where it is.
 */
const eventsListSource = liveDataSource(eventsList, {
  searchable: EVENT_LIST_SEARCHABLE,
});

export const eventListPane = Pane.define({
  title: "Events",
  route: defineRoute({ id: "event-list", segment: "list" }),
  app: eventsApp,
  component: EventListPaneView,
  width: 560,
});

function EventListPaneView(): ReactElement {
  // Activating a row means "show me this event": its own page, else the page it
  // was extracted from. Passed at the host level, so the list rows, the table
  // rows and the gallery cards all open the same thing.
  const openEvent = useOpenEvent();

  return (
    <PaneChrome pane={eventListPane}>
      <DataView<SourcedEvent>
        storageKey={EVENTS_LIST_VIEW}
        fields={eventFieldDefs}
        fieldExtensions={EventList.Fields}
        onRowActivate={openEvent}
        views={["list", "table", "gallery"]}
        emptyState={
          <Placeholder>
            No events — add a source from Sources to start collecting them.
          </Placeholder>
        }
        viewOptions={{
          list: {
            size: "md",
            renderRow: (e: ListedEvent) => <EventRow event={e} />,
          },
          gallery: {
            // The poster as the card's cover. `imageUrl` is deliberately NOT a
            // `FieldDef` (it is a display input, not a sort/filter dimension —
            // see core/internal/fields.ts), so the cover comes from the
            // accessor rather than `coverField`, which only resolves field ids.
            // No usable poster → `null` → no cover region at all, i.e. exactly
            // the text-only card, never an empty frame or a broken image.
            cover: (e: ListedEvent) => {
              const src = externalUrl(e.imageUrl);
              return src === null ? null : { kind: "image", src };
            },
          },
        }}
        source={eventsListSource}
      />
    </PaneChrome>
  );
}
