import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { useTaskCategories, useTaskCategoryMap } from "../hooks";

/**
 * Field extension contributed into the task-list's `Tasks.Fields` factory: a
 * render-callback component that reads the category registry (static after
 * boot) and this plugin's own live task-categories resource, and yields one
 * `category` enum `FieldDef<TaskListItem>` closed over both. `enum` + `value`
 * makes the field groupable by default, so the tasks tree can group by
 * category; the registry's order drives the section order, and uncategorized
 * tasks fall into the "None" bucket via the `null` value.
 */
export function CategoryField({ render }: FieldExtensionProps<TaskListItem>) {
  const categories = useTaskCategories();
  const map = useTaskCategoryMap();
  const fields = useMemo<FieldDef<TaskListItem>[]>(
    () => [
      {
        id: "category",
        label: "Category",
        type: "enum",
        options: categories.map((c) => ({ value: c.id, label: c.label })),
        value: (t) => map.get(t.id) ?? null,
        // Search-accessor only: keeping `category` out of the full-text search
        // accessor (it is a grouping dimension, not searchable text). It stays
        // in the Filter pill, which is gated on the field type resolving
        // operators.
        filterable: false,
      },
    ],
    [categories, map],
  );
  return <>{render(fields)}</>;
}
