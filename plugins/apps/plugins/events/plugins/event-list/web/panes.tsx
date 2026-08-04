import type { ReactElement } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useEventsRevision } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventRecord } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { queryEvents } from "../core";
import { eventFieldDefs } from "./internal/fields";
import { eventImageSrc } from "./internal/format";
import { EventRow } from "./components/event-row";
import { EventList } from "./slots";

/**
 * The Events surface id. Config-backed like every DataView: the view instances
 * (`Upcoming`, `All`, `By category`, …) live ONLY in
 * `config/apps/events/event-list/events.list.jsonc` — there is no
 * code-synthesized default, by design.
 */
const EVENTS_LIST_VIEW = defineDataView("events.list");

export const eventListPane = Pane.define({
  id: "event-list",
  segment: "list",
  component: EventListPaneView,
  width: 560,
});

function EventListPaneView(): ReactElement {
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick
  // (no refetch) — the first settled `rev` then refreshes once.
  const tick = useEventsRevision();
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <PaneChrome pane={eventListPane} title="Events">
      <DataView<EventRecord>
        storageKey={EVENTS_LIST_VIEW}
        rows={[]}
        fields={eventFieldDefs}
        fieldExtensions={EventList.Fields}
        rowKey={(e) => e.id}
        views={["list", "table", "gallery"]}
        emptyState={
          <Placeholder>
            No events — add a source from Sources to start collecting them.
          </Placeholder>
        }
        viewOptions={{
          list: {
            size: "md",
            renderRow: (e: EventRecord) => <EventRow event={e} />,
          },
          gallery: {
            // The poster as the card's cover. `imageUrl` is deliberately NOT a
            // `FieldDef` (it is a display input, not a sort/filter dimension —
            // see core/internal/fields.ts), so the cover comes from the
            // accessor rather than `coverField`, which only resolves field ids.
            // No usable poster → `null` → no cover region at all, i.e. exactly
            // the text-only card, never an empty frame or a broken image.
            cover: (e: EventRecord) => {
              const src = eventImageSrc(e.imageUrl);
              return src === null ? null : { kind: "image", src };
            },
          },
        }}
        dataSource={{
          changeTick,
          fetchPage: (args) => fetchEndpoint(queryEvents, {}, { body: args }),
        }}
      />
    </PaneChrome>
  );
}
