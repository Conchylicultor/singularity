import type { MouseEvent, ReactNode } from "react";
import { MdOpenInNew } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type {
  FieldDef,
  FieldValue,
} from "@plugins/primitives/plugins/data-view/web";
import type { EventRecord } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { EVENT_LIST_FIELDS } from "../../core";
import { externalUrl, formatEventWhen, urlHost } from "./format";

// Comparable projection for one field id. Drives the toolbar sort/filter pills
// and the default table/gallery cell. (Search/filter/sort actually run
// server-side; this powers the chrome and the read cells.)
function fieldValue(e: EventRecord, id: string): FieldValue {
  switch (id) {
    case "title":
      return e.title;
    case "startsAt":
      return e.startsAt;
    case "category":
      return e.category;
    case "venue":
      return e.venue;
    case "city":
      return e.city;
    case "price":
      return e.price;
    case "recurring":
      return e.recurring;
    case "url":
      return e.url;
    case "disappearedAt":
      return e.disappearedAt;
    default:
      return null;
  }
}

/**
 * External link chip: the host, opening the event's own page in a new tab.
 *
 * The href passes `externalUrl` (absolute `http(s)` only) — a scraped, model-written
 * value is never handed to the DOM as a destination unguarded. The click stops
 * propagating because the row around it is itself activatable (it opens the same
 * page, or the source's when the event has none): without this, clicking the chip
 * would open two tabs.
 */
function UrlCell({ url }: { url: string | null }): ReactNode {
  const href = externalUrl(url);
  const host = href === null ? null : urlHost(href);
  if (href === null || host === null) return null;
  return (
    <Badge
      as="a"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e: MouseEvent) => e.stopPropagation()}
      icon={<MdOpenInNew />}
      colorClass="bg-muted text-primary hover:bg-muted/80 hover:underline"
      title={href}
    >
      {host}
    </Badge>
  );
}

function cellFor(id: string): ((e: EventRecord) => ReactNode) | undefined {
  // `startsAt` is the one date rendered ABSOLUTELY: an events list is mostly
  // forward-looking and the weekday decides whether you go, which the generic
  // relative date cell ("in 3d") cannot say. `disappearedAt` is a provenance
  // stamp — relative is exactly right there, so it keeps the type's own cell.
  if (id === "startsAt") {
    return (e: EventRecord) => (
      <Text as="span" variant="body">
        {formatEventWhen(e.startsAt, e.allDay)}
      </Text>
    );
  }
  if (id === "disappearedAt") {
    return (e: EventRecord) =>
      e.disappearedAt ? <RelativeTime date={e.disappearedAt} /> : null;
  }
  if (id === "url") return (e: EventRecord) => <UrlCell url={e.url} />;
  return undefined;
}

// The web `FieldDef[]`, derived from the shared EVENT_LIST_FIELDS vocabulary so
// it can never drift from the server's FieldColumnMap. Every typed field here is
// automatically BOTH a filter and a sort dimension — which is why this surface
// hangs no bespoke filter chips off its toolbar.
export const eventFieldDefs: FieldDef<EventRecord>[] = EVENT_LIST_FIELDS.map(
  (spec) => ({
    id: spec.id,
    label: spec.label,
    type: spec.type,
    primary: spec.primary,
    sortable: spec.sortable,
    align: spec.align,
    options: spec.options,
    // `tags` is the one multi-value dimension: it projects through `values`
    // (folded into search + the array-aware filter predicate), never `value`.
    ...(spec.type === "tags"
      ? { values: (e: EventRecord) => e.tags }
      : {
          value: (e: EventRecord) => fieldValue(e, spec.id),
          cell: cellFor(spec.id),
        }),
  }),
);
