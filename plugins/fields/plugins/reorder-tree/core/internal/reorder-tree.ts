import { MdReorder } from "react-icons/md";
import { defineFieldType, defineFieldIdentity } from "@plugins/fields/core";

/**
 * A node in a reorder tree. A bare string is the terse form of `{ item }`.
 * Normalize via `normalizeNode` (config/core) before reading.
 */
export type ReorderNode =
  | string
  | { item: string; hidden?: boolean }
  | { spacer: string }
  | { group: string; items: ReorderNode[] };

export type ReorderTree = ReorderNode[];

export const reorderTreeFieldType = defineFieldType<ReorderTree>("reorder-tree");

export const reorderTreeIdentity = defineFieldIdentity<ReorderTree>({
  type: reorderTreeFieldType,
  label: "Reorder Tree",
  icon: MdReorder,
  // no coerce — not a sortable/filterable scalar (like string-list).
});
