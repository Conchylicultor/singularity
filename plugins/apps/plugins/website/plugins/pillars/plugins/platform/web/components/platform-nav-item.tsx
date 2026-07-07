import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { platformPane } from "../panes";

/**
 * "Platform" entry in the shared site header, contributed into the End zone.
 * Opens the Platform pillar pane.
 */
export function PlatformNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Platform"
      onClick={() => openPane(platformPane, {}, { mode: "root" })}
    />
  );
}
