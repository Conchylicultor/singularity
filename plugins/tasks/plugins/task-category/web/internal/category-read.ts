import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import type { TaskCategoryDef } from "@plugins/tasks/plugins/task-category/core";
import type { TaskCategoryMap } from "../hooks";

/** Where one of the category field's reads is: held, not yet, or failed. */
export type Read<T> =
  | { kind: "pending" }
  | { kind: "known"; value: T }
  | { kind: "failed"; error: Error; refetch: () => Promise<void> };

/**
 * A read's state. A failure over a held value is that value (the field keeps
 * painting what it last knew); a failure with nothing held is `failed`, with
 * the read's own Retry.
 */
export function readOf<T>(result: ResourceResult<T>): Read<T> {
  switch (result.status) {
    case "loading":
      return { kind: "pending" };
    case "ready":
      return { kind: "known", value: result.data };
    case "error":
      return result.stale !== undefined
        ? { kind: "known", value: result.stale }
        : { kind: "failed", error: result.error, refetch: result.refetch };
  }
}

/** The category field's state, from its two reads. */
export type CategoryFieldRead =
  | { kind: "pending" }
  | { kind: "known"; map: TaskCategoryMap; categories: TaskCategoryDef[] }
  | { kind: "failed"; error: Error; refetch: () => Promise<void> };

/**
 * Both reads known → the field is known; otherwise a failure (the set's ahead
 * of the registry's) beats pending. Either read alone is not enough: the map
 * without the registry would lay sections out under raw ids in id order, the
 * registry without the map would file every task under None — each a claim
 * that reverses when the other read lands.
 */
export function categoryFieldRead(
  map: Read<TaskCategoryMap>,
  categories: Read<TaskCategoryDef[]>,
): CategoryFieldRead {
  if (map.kind === "failed") return map;
  if (categories.kind === "failed") return categories;
  if (map.kind === "pending" || categories.kind === "pending")
    return { kind: "pending" };
  return { kind: "known", map: map.value, categories: categories.value };
}

/**
 * The `category` enum field over the field's state. Its `options` (the
 * sections' order and labels) and its `value` (`null` = the None bucket) are
 * only ever READY values: a pending or failed field draws its state in every
 * cell and holds any view laid out by it (data-view's `pending` / `readError`).
 */
export function categoryFieldDef(
  read: CategoryFieldRead,
): FieldDef<TaskListItem> {
  return {
    id: "category",
    label: "Category",
    type: "enum",
    options:
      read.kind === "known"
        ? read.categories.map((c) => ({ value: c.id, label: c.label }))
        : [],
    value: (t) => (read.kind === "known" ? (read.map.get(t.id) ?? null) : null),
    ...(read.kind === "pending" ? { pending: true } : {}),
    ...(read.kind === "failed"
      ? { readError: { error: read.error, refetch: read.refetch } }
      : {}),
    // Search-accessor only: keeping `category` out of the full-text search
    // accessor (it is a grouping dimension, not searchable text). It stays in
    // the Filter pill, which is gated on the field type resolving operators.
    filterable: false,
  };
}
