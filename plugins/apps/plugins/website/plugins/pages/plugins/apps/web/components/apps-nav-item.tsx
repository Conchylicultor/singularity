import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { appsPane } from "../panes";

/**
 * "Apps" entry in the shared site header. Opens the applications page.
 */
export function AppsNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Apps"
      onClick={() => openPane(appsPane, {}, { mode: "root" })}
    />
  );
}
