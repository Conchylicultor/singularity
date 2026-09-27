import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { foundationsPane } from "../panes";

/**
 * "Foundations" entry in the shared site header. Opens the technical
 * foundations page.
 */
export function FoundationsNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Foundations"
      onClick={() => openPane(foundationsPane, {}, { mode: "root" })}
    />
  );
}
