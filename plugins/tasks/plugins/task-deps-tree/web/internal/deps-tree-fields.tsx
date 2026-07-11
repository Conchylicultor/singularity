import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { patchTask } from "@plugins/tasks/web";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import {
  STATUS_META,
  StatusIcon,
  StatusBadge,
} from "@plugins/tasks/plugins/task-status/web";
import type { DepsTreeRow } from "@plugins/tasks/plugins/task-deps-tree/core";
import { AlsoAfterChips } from "./deps-actions";

// Choices derived from the single status-metadata source, so the labels never
// drift from the rest of the app. (Fields are defined locally — task-list's
// `taskFields` is barrel-internal.)
const STATUS_OPTIONS = (
  Object.entries(STATUS_META) as [TaskStatus, { label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }));

export const depsTreeFields: FieldDef<DepsTreeRow>[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    primary: true,
    value: (t) => t.title || "Untitled",
    onEdit: (t, next) =>
      patchTask(t.id, { title: String(next ?? "").trim() || "Untitled" }),
  },
  {
    id: "status",
    label: "Status",
    type: "enum",
    align: "end",
    options: STATUS_OPTIONS,
    value: (t) => t.status,
    cell: (t) => <StatusBadge status={t.status} />,
  },
];

export const depsTreeOptions: TreeViewOptions<DepsTreeRow> = {
  leadingIcon: (t) => <StatusIcon status={t.status} />,
  labelClassName: (t) =>
    cn(
      t.status === "dropped" && "text-muted-foreground/70 line-through italic",
      t.status === "done" && "text-muted-foreground",
    ),
  expandAll: true,
  // The whole runs-after chain — incl. the tasks blocked BY the selected one —
  // must be visible without hunting; a dependency tree that hides its downstream
  // is the bug we are fixing. Open by default, still collapsible.
  defaultExpanded: true,
  trailing: (t) => <AlsoAfterChips row={t} />,
  dragOverlay: (t) => t.title || "Untitled",
};
