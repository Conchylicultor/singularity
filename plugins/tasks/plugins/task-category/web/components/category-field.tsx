import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { useTaskCategories, useTaskCategoryMap } from "../hooks";
import {
  categoryFieldDef,
  categoryFieldRead,
  readOf,
} from "../internal/category-read";

/**
 * Field extension contributed into the task-list's `Tasks.Fields` factory: a
 * render-callback component that reads the category registry (static after
 * boot) and this plugin's own live `task-categories` set, and yields one
 * `category` enum `FieldDef<TaskListItem>` closed over both. `enum` + `value`
 * makes the field groupable by default, so the tasks tree can group by
 * category; the registry's order drives the section order and its labels name
 * the sections, and uncategorized tasks fall into the "None" bucket via the
 * `null` value.
 *
 * Not known yet is not "uncategorized", and an empty option list is not "no
 * categories": `null` is the None bucket and `options` are the sections'
 * order and labels, so the field claims neither until BOTH reads are known
 * (`categoryFieldRead`). While either has never loaded the field is `pending`
 * (its cells draw the loading block, and a view grouped, sorted or filtered by
 * it renders its loading state — never raw-id sections that relabel and
 * reorder when the registry lands); a failed read with nothing held — the
 * set's or the registry's — is its `readError` (the cells, and a view laid out
 * by it, show the failure with that read's Retry); a failure over a held value
 * keeps painting that value. The set is preloaded at boot; the registry is an
 * endpoint read, so a cold tab is pending for one round-trip.
 */
export function CategoryField({ render }: FieldExtensionProps<TaskListItem>) {
  const categories = useTaskCategories();
  const map = useTaskCategoryMap();
  const fields = useMemo<FieldDef<TaskListItem>[]>(
    () => [
      categoryFieldDef(categoryFieldRead(readOf(map), readOf(categories))),
    ],
    [categories, map],
  );
  return <>{render(fields)}</>;
}
