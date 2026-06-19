import type { SortRule } from "../../core";

/**
 * Header-click reconciliation: cycle the PRIMARY sort rule for `fieldId`
 * against the existing multi-level rule list, so the header path and the sort
 * builder share one source of truth (never diverge). Pure + immutable.
 *
 *   - field is already primary, asc  → primary becomes desc (secondary kept)
 *   - field is already primary, desc → primary dropped (secondary promoted up)
 *   - field is absent or secondary   → promoted to primary asc, any existing
 *                                       rule for it removed from its old slot
 */
export function cyclePrimarySort(rules: SortRule[], fieldId: string): SortRule[] {
  const primary = rules[0];
  if (primary?.fieldId === fieldId) {
    return primary.direction === "asc"
      ? [{ fieldId, direction: "desc" }, ...rules.slice(1)]
      : rules.slice(1);
  }
  return [
    { fieldId, direction: "asc" },
    ...rules.filter((r) => r.fieldId !== fieldId),
  ];
}
