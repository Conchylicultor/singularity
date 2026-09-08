import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { appsPane } from "../panes";

/**
 * "For users" entry in the shared site header. Opens the applications page.
 *
 * Addressed to a reader rather than titled, exactly as the homepage's fork card
 * is — the nav and the card must agree about who this page is for.
 */
export function AppsNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="For users"
      onClick={() => openPane(appsPane, {}, { mode: "root" })}
    />
  );
}
