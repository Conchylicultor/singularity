import { sql } from "drizzle-orm";
import {
  bindColumns,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { eventsTable } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { EVENT_LIST_FILTERABLE } from "../../core";

// Binds every EVENT_LIST_FILTERABLE column → its `events` column (domain copied
// from the declaration; a declared column with no binding is a tsc error), with
// `nullable` for the null-aware keyset seek. A filter naming anything else is
// refused with a 400 — never dropped.
//
// `eventsTable` is a READ handle (the `events/no-raw-events-write` rule fails any
// write on it outside the repo funnel); a query map is exactly its intended use.
//
// `tags` binds the jsonb string array itself (the `stringArray` domain's
// containment ops); `tagsText` is the same array rendered as text, for search.
export const COLUMN_MAP: FieldColumnMap = bindColumns(EVENT_LIST_FILTERABLE, {
  title: { col: eventsTable.title },
  description: { col: eventsTable.description, nullable: true },
  startsAt: { col: eventsTable.startsAt },
  category: { col: eventsTable.category },
  venue: { col: eventsTable.venue, nullable: true },
  city: { col: eventsTable.city, nullable: true },
  price: { col: eventsTable.price, nullable: true },
  recurring: { col: eventsTable.recurring },
  tags: { col: eventsTable.tags },
  tagsText: { col: sql`${eventsTable.tags}::text` },
  url: { col: eventsTable.url, nullable: true },
  disappearedAt: { col: eventsTable.disappearedAt, nullable: true },
  sourceId: { col: eventsTable.sourceId },
});
