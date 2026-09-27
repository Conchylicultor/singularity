import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { downloadPane } from "../panes";

/**
 * "Download" entry in the shared site header. Opens the download page.
 */
export function DownloadNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Download"
      onClick={() => openPane(downloadPane, {}, { mode: "root" })}
    />
  );
}
