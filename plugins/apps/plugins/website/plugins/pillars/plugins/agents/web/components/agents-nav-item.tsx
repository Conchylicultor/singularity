import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteNavLink } from "@plugins/apps/plugins/website/plugins/shell/web";
import { agentsPane } from "../panes";

/**
 * "Agents" entry in the shared site header, contributed into the End zone.
 * Opens the Agents pillar pane.
 */
export function AgentsNavItem() {
  const openPane = useOpenPane();
  return (
    <WebsiteNavLink
      label="Agents"
      onClick={() => openPane(agentsPane, {}, { mode: "root" })}
    />
  );
}
