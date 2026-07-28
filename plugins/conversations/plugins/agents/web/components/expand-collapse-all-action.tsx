import {
  useOptionalTreeListContext,
  useSubtreeExpandAll,
  type TreeItem,
  type TreeListContextValue,
} from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { Agent } from "../../shared/resources";

export function ExpandCollapseAllAction({
  row,
  hasChildren,
}: ItemActionProps<Agent>) {
  // Non-throwing context read: this action is contributed to an item-action slot
  // that EVERY view renders (list / table / gallery / tree), so it must be legal
  // to ask "am I inside a tree?" from a flat one. Outside a tree the action
  // hides itself — expand-all is meaningless there.
  const ctx = useOptionalTreeListContext();
  if (!ctx || !hasChildren) return null;
  return <ExpandCollapseAllActionInner ctx={ctx} rootId={row.id} />;
}

function ExpandCollapseAllActionInner({
  ctx,
  rootId,
}: {
  ctx: TreeListContextValue<TreeItem>;
  rootId: string;
}) {
  // `ctx.rows` are the tree's projected rows — already
  // `{ id, parentId, rank, expanded }`, i.e. `ExpandableRow` — and
  // `ctx.setExpanded` writes the view's own device-local expand map. So the
  // agents live-state subscription this used to need is gone.
  const { willCollapse, toggle } = useSubtreeExpandAll(
    ctx.rows,
    rootId,
    ctx.setExpanded,
  );
  return <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />;
}
