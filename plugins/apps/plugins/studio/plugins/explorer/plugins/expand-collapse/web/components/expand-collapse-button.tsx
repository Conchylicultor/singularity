import { MdUnfoldLess, MdUnfoldMore } from "react-icons/md";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  useOptionalTreeListContext,
  useSubtreeExpandAll,
  type TreeItem,
  type TreeListContextValue,
} from "@plugins/primitives/plugins/tree/web";

function ExpandCollapseButtonInner({
  ctx,
  rootId,
}: {
  ctx: TreeListContextValue<TreeItem>;
  rootId: string;
}) {
  // `ctx.rows` are the tree's projected rows — already
  // `{ id, parentId, rank, expanded }` — and their `id` is `rowKey(row)`, which
  // the explorer defines as the row's `.id`, i.e. the same dotted plugin id this
  // badge receives as `node.id`. So the two id spaces coincide and there is
  // nothing to project here. `ctx.setExpanded` writes the view's own
  // device-local expand map.
  const { willCollapse, toggle } = useSubtreeExpandAll(
    ctx.rows,
    rootId,
    ctx.setExpanded,
  );

  return (
    <button
      type="button"
      // eslint-disable-next-line button-safety/no-async-raw-button -- the promise is synthetic: `toggle` is async only because the hook's batch seam is typed `void | Promise<void>`; the sink here is `ctx.setExpanded`, a synchronous setState on device-local view state that lands in the same commit as the click. There is no in-flight state to reflect and no double-click hazard, and this 16px hover-revealed badge deliberately does not carry Button's chrome.
      onClick={(e) => void toggle(e)}
      aria-label={willCollapse ? "Collapse all" : "Expand all"}
      className="hidden size-4 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted-foreground/10 group-hover/tree-row:block"
    >
      <Center axis="both" className="size-full">
        {willCollapse ? (
          <MdUnfoldLess className="size-3" />
        ) : (
          <MdUnfoldMore className="size-3" />
        )}
      </Center>
    </button>
  );
}

export function ExpandCollapseButton({ node }: { node: PluginNode }) {
  // Non-throwing context read: this badge renders inside a tree row, so the
  // context is normally present — but the badge slot is not itself tree-bound,
  // and hooks cannot run after an early return, hence the outer/inner split.
  const ctx = useOptionalTreeListContext();
  if (!ctx || node.children.length === 0) return null;
  return <ExpandCollapseButtonInner ctx={ctx} rootId={node.id} />;
}
