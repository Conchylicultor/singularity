import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { appsPane } from "../panes";

/**
 * "Vision" entry in the shared site header. Opens the applications page — the
 * vision for applications, which is what a reader following it is after.
 */
export function AppsNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Vision"
      onClick={() => openPane(appsPane, {}, { mode: "root" })}
    />
  );
}
