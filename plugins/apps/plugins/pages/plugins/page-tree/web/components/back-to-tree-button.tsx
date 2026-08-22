import { MdArrowBack } from "react-icons/md";
import {
  PaneIconAction,
  useOpenPane,
  useSurfaceAppId,
} from "@plugins/primitives/plugins/pane/web";
import { pagesApp } from "@plugins/apps/plugins/pages/plugins/shell/core";
import { pagesTreePane } from "../panes";

/**
 * "Back to the page tree", at the head of the page's own title bar.
 *
 * It exists for the surface where the tree is NOT beside the page: the
 * `pagesTreePane` column opened next to a conversation, which the clicked page
 * takes over (see `PagesSidebar`). Without this, that column has no way back —
 * the tree it came from is gone.
 *
 * So the button paints only when this surface shows no tree of its own:
 *
 *  - in the Pages app the tree is the app's sidebar, permanently beside the
 *    page (and the header already carries the sidebar toggle), and
 *  - anywhere the tree column is still in the pane chain, it is one column to
 *    the left and a click away.
 *
 * Both are asked of the live route/surface rather than remembered from how the
 * page was opened, so a page reached some other way (a task's origin chip, a
 * deep link) gets the same way to the tree.
 */
export function BackToTreeButton() {
  const openPane = useOpenPane();
  const treeColumn = pagesTreePane.useRouteEntry();
  const surfaceAppId = useSurfaceAppId();

  if (surfaceAppId === pagesApp.id || treeColumn !== null) return null;

  return (
    <PaneIconAction
      label="Back to pages"
      icon={MdArrowBack}
      // `swap`: the page's own column becomes the tree again — the exact
      // inverse of the row activation that put the page here.
      onClick={() => openPane(pagesTreePane, {}, { mode: "swap" })}
    />
  );
}
