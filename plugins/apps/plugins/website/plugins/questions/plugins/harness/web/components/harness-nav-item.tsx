import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { harnessPane } from "../panes";

/**
 * "Harness" entry in the shared site header. Opens the engineering page.
 */
export function HarnessNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Harness"
      onClick={() => openPane(harnessPane, {}, { mode: "root" })}
    />
  );
}
