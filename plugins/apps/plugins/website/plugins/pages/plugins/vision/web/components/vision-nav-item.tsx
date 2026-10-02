import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { visionPane } from "../panes";

/**
 * "Vision" entry in the shared site header. Opens the vision page — the
 * vision for applications, which is what a reader following it is after.
 */
export function VisionNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Vision"
      onClick={() => openPane(visionPane, {}, { mode: "root" })}
    />
  );
}
