import { MdOpenInFull } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useCurrentAppId } from "@plugins/apps-core/web";
import { appLinkProps } from "@plugins/apps-core/plugins/tabs/web";
import { pageDetailRoute } from "@plugins/apps/plugins/pages/plugins/page-tree/core";
import { pagesApp } from "@plugins/apps/plugins/pages/plugins/shell/core";

/**
 * "Open in Pages" header action contributed to `PageDetail.HeaderActions`.
 *
 * The page-detail pane is reusable chrome: the agent manager opens it as a
 * column beside a conversation, and any other app may do the same. Read there,
 * a page is a peek — the surrounding app's own column set is what the user is
 * really working in — so this offers the way back out: expand the page into the
 * Pages app, where the tree, search and the rest of its own surface are.
 *
 * Inside Pages it renders nothing. "Expand to Pages" while already in Pages is
 * a no-op, and a button that does nothing is worse than an absent one.
 */
export function OpenInAppAction({ pageId }: { pageId: string }) {
  const currentAppId = useCurrentAppId();
  if (currentAppId === pagesApp.id) return null;
  return (
    <IconButton
      icon={MdOpenInFull}
      label="Open in Pages"
      tooltip="Open in Pages — middle-click for a new tab"
      {...appLinkProps(pageDetailRoute.link(pagesApp, { pageId }))}
    />
  );
}
