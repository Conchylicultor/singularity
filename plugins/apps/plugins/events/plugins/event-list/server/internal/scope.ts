import {
  filterColumns,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";

/** The soft-deletion stamp's field id — see `EVENT_LIST_FIELDS`. */
export const DISAPPEARED_FIELD_ID = "disappearedAt";

/**
 * Does the (decoded) filter carry any clause on `column`, anywhere in the tree?
 *
 * Drives the default scopes below. Pure and total (no filter is `false`), so it
 * is unit-tested next to this file.
 */
export function filterMentionsField(
  filter: Filter | undefined,
  column: string,
): boolean {
  return filterColumns(filter).has(column);
}

/**
 * Should the query hide soft-deleted (disappeared) events?
 *
 * Disappearance is soft — an event absent from a successful extraction is
 * stamped, never deleted, so a flaky scrape cannot destroy rows the user may
 * have annotated. The flip side is that those rows must not clutter an ordinary
 * browse, so the default is to hide them.
 *
 * It is a DEFAULT and not a server-fixed scope (unlike mail-inbox's INBOX
 * predicate) because `disappearedAt` is a real, filterable field: a view that
 * names it is explicitly asking about disappearance, and a hard predicate would
 * make its own answer unreachable. The rule is therefore: hide them unless the
 * caller's filter mentions the field at all — with any op, since `isNotEmpty`
 * (show only disappeared) and `isEmpty` (the default, stated explicitly) are
 * both legitimate and both must win over the default.
 */
export function shouldHideDisappeared(filter: Filter | undefined): boolean {
  return !filterMentionsField(filter, DISAPPEARED_FIELD_ID);
}

/** The contributed `source` dimension's field id — see `EVENT_LIST_FILTERABLE`. */
export const SOURCE_FIELD_ID = "sourceId";

/**
 * Should the query hide events belonging to a DISABLED source?
 *
 * Disabling a source is the user saying "I don't care about this any more". It
 * already means the scheduler skips it and `Refresh now` refuses; it must also
 * mean its events stop cluttering the list — without deleting anything, so the
 * toggle stays a one-click, fully reversible decision.
 *
 * Same shape as {@link shouldHideDisappeared}, and for the same reason: a
 * DEFAULT, never a fixed predicate. `sourceId` is a real filterable dimension
 * (contributed by the `sources` plugin), so a view that names it AT ALL — with
 * any op, "source is X" as much as "source is not empty" — is explicitly
 * asking about sources and must get exactly what it asked for, a disabled
 * source's events included. A hard predicate would instead make a disabled
 * source's whole history unreachable.
 *
 * That reversibility is the whole reason this is a query-time scope and not a
 * write: the events are not stamped, not moved and not deleted, so re-enabling
 * the source brings every one of them straight back with nothing to undo.
 */
export function shouldHideInactiveSources(filter: Filter | undefined): boolean {
  return !filterMentionsField(filter, SOURCE_FIELD_ID);
}
