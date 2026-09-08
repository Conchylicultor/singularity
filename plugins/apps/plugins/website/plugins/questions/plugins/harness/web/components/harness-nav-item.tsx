import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { harnessPane } from "../panes";

/**
 * "For developers" entry in the shared site header. Opens the engineering page.
 *
 * Addressed to a reader rather than titled, exactly as the homepage's fork card
 * is — the nav and the card must agree about who this page is for.
 */
export function HarnessNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="For developers"
      onClick={() => openPane(harnessPane, {}, { mode: "root" })}
    />
  );
}
