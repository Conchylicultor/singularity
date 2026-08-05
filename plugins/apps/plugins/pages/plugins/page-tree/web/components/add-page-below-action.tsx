import { MdAdd } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useOptionalRowControls } from "@plugins/primitives/plugins/tree/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";

/**
 * Create a sibling page right below this one — formerly the tree primitive's own
 * per-row "⋯" menu, which held this single entry. As an ordinary item action it
 * joins the row's ONE open action registry (`pages.tree.row-actions`), so the
 * authored overflow bucket decides whether it sits inline or behind the `⋯`,
 * instead of the row growing a second, parallel menu of its own.
 *
 * The positional create lives on the tree row (`addBelow` needs the node), which
 * is why this reads the row's controls from context. An item action renders in
 * EVERY view of the DataView — Favorites is a flat `list` — so absent controls
 * are the normal non-tree case, not an error: the action simply doesn't paint.
 */
export function AddPageBelowAction(_props: ItemActionProps<PageRow>) {
  const controls = useOptionalRowControls();
  if (!controls) return null;

  return (
    <IconButton
      icon={MdAdd}
      label="Add page below"
      onClick={(e) => {
        e.stopPropagation();
        return controls.addBelow();
      }}
    />
  );
}
