import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import type { DepsTreeRow } from "@plugins/tasks/plugins/task-deps-tree/core";
import { AlsoAfterChips } from "./deps-actions";

// Fields are NOT defined here: both sources spread task-list's `taskFieldSchema`,
// so this tree carries exactly the columns of every other task view (track,
// category, … included). Only the tree chrome is deps-specific.
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
