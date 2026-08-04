import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { useEventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import type { EventRecord } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * The `source` dimension of the events DataView, contributed into
 * `event-list`'s `EventList.Fields` seam.
 *
 * A component rather than plain data because the option list is hook-loaded:
 * only this plugin holds the live `event_sources` rows, and `FieldDef.value` is
 * a synchronous closure that cannot call hooks. Same shape as
 * `tasks/task-category`'s `CategoryField`.
 *
 * The field id is **`sourceId`**, matching the physical column already bound in
 * `event-list`'s server `COLUMN_MAP` — that binding is what makes filtering and
 * sorting by source compile to SQL with zero edits to `event-list`. Renaming the
 * id here silently downgrades the dimension to client-side-only.
 */
export function SourceField({ render }: FieldExtensionProps<EventRecord>): ReactNode {
  const result = useEventSources();

  const fields = useMemo<FieldDef<EventRecord>[]>(() => {
    // Empty while the window is still settling — the field exists either way, so
    // the Filter pill never appears and disappears; it just has no choices yet.
    // Not an absorbed failure: the resource's own error surfaces on the Sources
    // surface, which is the only place it is actionable.
    const options = result.pending
      ? []
      : result.data.map((s) => ({ value: s.id, label: s.name }));
    return [
      {
        id: "sourceId",
        label: "Source",
        type: "enum",
        options,
        value: (e) => e.sourceId,
        // Grouping dimension, not searchable text: an id typed into the search
        // box should not match every event from that source.
        filterable: false,
      },
    ];
  }, [result]);

  return <>{render(fields)}</>;
}
