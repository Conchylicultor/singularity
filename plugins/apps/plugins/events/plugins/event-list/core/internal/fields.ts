import { EVENT_CATEGORIES } from "@plugins/apps/plugins/events/plugins/events-core/core";

// The single shared field vocabulary driving BOTH the web `FieldDef[]` (added
// `value`/`cell` accessors) and the server `FieldColumnMap` (added drizzle
// columns), so the two runtimes can never drift on which dimensions exist, what
// type they are, or what enum choices they offer. Plain data only (browser-safe)
// — no React, no drizzle.
//
// `description` / `imageUrl` / `allDay` / `date` are deliberately NOT fields:
// they are display or formatting inputs the row renderer reads straight off the
// record, and promoting them here would only add dead sort/filter axes.
// (`description` is still reachable — the server search covers it via ILIKE.)
// `date` in particular is jsonb: the queryable dimensions are its denormalized
// projections (`startsAt`, `recurring`), which are indexed columns and already
// fields below.
//
// `sourceId` is deliberately absent too: the `source` dimension arrives later as
// a CONTRIBUTED field extension (its label and its option list are the sources
// plugin's to own, since only that plugin holds the live source rows). The
// physical column is bound in the server `COLUMN_MAP` under the same id, so the
// contributed field filters and sorts server-side with no edit here — this
// plugin names no source type, ever.
export type EventFieldType = "text" | "date" | "enum" | "bool" | "tags";

export interface EventFieldSpec {
  id: string;
  label: string;
  type: EventFieldType;
  /** Tree/primary label field (the one rendered as the row title). */
  primary?: boolean;
  /**
   * Sortable in the toolbar Sort pill (also the keyset-sortable set). Left
   * undefined = the `FieldDef` default (sortable when a `value` projection
   * exists); set `false` for a field with no server column binding, so the pill
   * never offers a sort the server would silently drop.
   */
  sortable?: boolean;
  /** Column may be NULL — drives null-aware keyset seek terms server-side. */
  nullable?: boolean;
  /** Table/list trailing alignment for this field. */
  align?: "start" | "end" | "center";
  /** enum choices — drives the Filter pill multiselect and the enum chip cell. */
  options?: { value: string; label: string }[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The closed category vocabulary, as Filter-pill / enum-cell options. */
export const EVENT_CATEGORY_OPTIONS = EVENT_CATEGORIES.map((c) => ({
  value: c,
  label: cap(c),
}));

export const EVENT_LIST_FIELDS: EventFieldSpec[] = [
  { id: "title", label: "Title", type: "text", primary: true, sortable: true },
  { id: "startsAt", label: "When", type: "date", sortable: true },
  {
    id: "category",
    label: "Category",
    type: "enum",
    options: EVENT_CATEGORY_OPTIONS,
  },
  { id: "venue", label: "Venue", type: "text", nullable: true },
  { id: "city", label: "City", type: "text", nullable: true },
  // Free text ("Free", "12–18 €") — venues do not publish a normalizable
  // number, so this is a text dimension, never a `number` one.
  { id: "price", label: "Price", type: "text", nullable: true },
  { id: "recurring", label: "Recurring", type: "bool" },
  // `tags` has no server-side filter/sort binding (there is no
  // `fields/tags/filter-sql` capability yet), so it is display + search only:
  // `sortable: false` keeps a dead sort out of the pill, and the server search
  // covers tags via a text cast. See this plugin's CLAUDE.md.
  { id: "tags", label: "Tags", type: "tags", sortable: false },
  { id: "url", label: "Link", type: "text", nullable: true, sortable: false },
  // The soft-deletion stamp. A real, filterable dimension on purpose: the query
  // hides disappeared events BY DEFAULT, and an explicit rule on this field is
  // how a view says "I know about disappearance — here is what I want".
  {
    id: "disappearedAt",
    label: "Disappeared",
    type: "date",
    nullable: true,
    sortable: false,
  },
];
