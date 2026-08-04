import type { FieldColumnMap } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { eventsTable } from "@plugins/apps/plugins/events/plugins/events-core/server";

// Binds each mapped EVENT_LIST_FIELDS id → its physical `events` column, with
// the field-type token (resolving the operator→SQL builder) and `nullable` for
// the null-aware keyset seek. Unmapped filter/sort fields are dropped fail-soft
// by the compiler — never a 400.
//
// `eventsTable` is a READ handle (the `events/no-raw-events-write` rule fails any
// write on it outside the repo funnel); a query map is exactly its intended use.
//
// Two ids here have no web `FieldDef` in this plugin, on purpose:
//
//  - `sourceId` — the `source` dimension is a CONTRIBUTED field extension owned
//    by the sources plugin (only it holds the live source rows the option list
//    needs). Binding the physical column here means that contributed field
//    filters and sorts server-side the moment it lands, with zero edits to this
//    file and without this plugin naming any source type.
//  - `tags` is deliberately ABSENT: there is no `fields/tags` filter-sql
//    capability, so a binding would resolve no operator and every tag rule would
//    be dropped silently. The field declares `sortable: false` and the search
//    covers tags via a text cast instead.
export const COLUMN_MAP: FieldColumnMap = {
  title: { col: eventsTable.title, type: "text" },
  startsAt: { col: eventsTable.startsAt, type: "date" },
  category: { col: eventsTable.category, type: "enum" },
  venue: { col: eventsTable.venue, type: "text", nullable: true },
  city: { col: eventsTable.city, type: "text", nullable: true },
  price: { col: eventsTable.price, type: "text", nullable: true },
  recurring: { col: eventsTable.recurring, type: "bool" },
  url: { col: eventsTable.url, type: "text", nullable: true },
  disappearedAt: { col: eventsTable.disappearedAt, type: "date", nullable: true },
  sourceId: { col: eventsTable.sourceId, type: "enum" },
};
