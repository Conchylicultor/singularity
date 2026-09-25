import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { SourcedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";

export const EventList = {
  /**
   * Extra DataView `FieldDef<SourcedEvent>[]` injected by other plugins — typed
   * on the row the list actually holds (the event plus its joined source ref).
   *
   * A field extension is a *component* (not plain data) so its `value` closure
   * can capture hook-loaded data — which is exactly what the `source` dimension
   * needs: only the sources plugin holds the live `event_sources` rows that its
   * option list is built from. It contributes here; this plugin names no source
   * type and no source id, ever.
   *
   * A contributed field is a full dimension, not a display-only one: the host
   * folds it in BEFORE the sort/filter controllers, and the physical column it
   * projects (`sourceId`) is already bound in the server `COLUMN_MAP`, so
   * filtering and sorting on it compile to SQL with no edit to this plugin.
   */
  Fields: defineFieldExtensions<SourcedEvent>(),
};
