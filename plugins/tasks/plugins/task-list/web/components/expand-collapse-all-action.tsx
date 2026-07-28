import {
  useOptionalTreeListContext,
  useSubtreeExpandAll,
  type TreeItem,
  type TreeListContextValue,
} from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";

function ExpandCollapseAllActionInner({
  ctx,
  rootId,
}: {
  ctx: TreeListContextValue<TreeItem>;
  rootId: string;
}) {
  // `ctx.rows` are the tree's projected rows — already
  // `{ id, parentId, rank, expanded }`, i.e. `ExpandableRow` — and
  // `ctx.setExpanded` writes the view's own device-local expand map. So there is
  // nothing to subscribe to and no folderId → parentId projection to do here.
  const { willCollapse, toggle } = useSubtreeExpandAll(
    ctx.rows,
    rootId,
    ctx.setExpanded,
  );
  return <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />;
}

export function ExpandCollapseAllAction({
  row,
  hasChildren,
}: ItemActionProps<TaskListItem>) {
  // Non-throwing context read: this action is contributed to an item-action slot
  // that EVERY view renders (list / table / gallery / tree), and the tasks
  // surface ships a `recent` LIST instance. Outside a tree the action hides
  // itself — expand-all is meaningless in a flat list.
  const ctx = useOptionalTreeListContext();
  if (!ctx || !hasChildren) return null;
  return <ExpandCollapseAllActionInner ctx={ctx} rootId={row.id} />;
}
