import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadsPane } from "../panes";

/**
 * The site's single call-to-action, contributed into the shared header's End
 * zone. Renders the standard nav link in its `primary` (CTA) form and opens the
 * downloads pane.
 */
export function DownloadNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Download"
      primary
      onClick={() => openPane(downloadsPane, {}, { mode: "root" })}
    />
  );
}
