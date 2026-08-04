import type {
  FilterGroup,
  FilterNode,
} from "@plugins/primitives/plugins/data-view/core";

/** The soft-deletion stamp's field id — see `EVENT_LIST_FIELDS`. */
export const DISAPPEARED_FIELD_ID = "disappearedAt";

/**
 * Does the filter tree carry any rule on `fieldId`?
 *
 * Drives the default scope below. Pure and total (a group with no children is
 * `false`), so it is unit-tested next to this file.
 */
export function filterMentionsField(
  node: FilterGroup | FilterNode | null,
  fieldId: string,
): boolean {
  if (!node) return false;
  if (node.kind === "rule") return node.fieldId === fieldId;
  return node.children.some((child) => filterMentionsField(child, fieldId));
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
 * caller's filter mentions the field at all — with any operator, since
 * `is-not-empty` (show only disappeared) and `is-empty` (the default, stated
 * explicitly) are both legitimate and both must win over the default.
 */
export function shouldHideDisappeared(filter: FilterGroup | null): boolean {
  return !filterMentionsField(filter, DISAPPEARED_FIELD_ID);
}
