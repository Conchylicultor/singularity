import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { EventSource } from "@plugins/apps/plugins/events/plugins/events-core/core";

/**
 * The source side-pane, as ONE render slot. Settings / Schedule / Status / Runs
 * are peer contributions and the host owns every card, so a source type that
 * needs its own region contributes a section instead of this plugin growing a
 * branch for it.
 *
 * The entity prop is the `sourceId`, NOT the row: the row lives in a shared live
 * window resource every section already subscribes to (`useEventSource`), so
 * threading the id keeps each section responsible for its own freshness and lets
 * a section mount without the pane having resolved the row first.
 *
 * Slot id is `event-source-detail.section` verbatim — renaming it silently
 * resets every user's persisted section order.
 */
export const EventSourceDetail = defineDetailSections<{ sourceId: string }>(
  "event-source-detail",
);

/**
 * Per-row actions on the sources list. A slot rather than a hardcoded button so
 * a source type (or a future plugin) can add a row action without this file
 * naming it — the same shape `deploy/servers` uses for its console action.
 */
export const EventSourceActions = defineItemActions<EventSource>(
  "events.sources.item-actions",
);
