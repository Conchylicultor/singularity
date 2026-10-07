import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { guidePane } from "../panes";

/**
 * "Guide" entry in the shared site header. Opens the getting-started guide.
 */
export function GuideNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Guide"
      {...openPane.link(guidePane, {}, { mode: "root" })}
    />
  );
}
