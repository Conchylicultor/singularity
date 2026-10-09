import {
  PaneIconAction,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { agentSidePane, agentDetailPane } from "../panes";
import { navIcons } from "@plugins/ui/plugins/icons/core";

export function ExpandAgentButton() {
  const { agentId } = agentSidePane.useParams();
  const openPane = useOpenPane();
  return (
    <PaneIconAction
      label="Expand"
      icon={navIcons.expand}
      {...openPane.link(agentDetailPane, { id: agentId }, { mode: "root" })}
    />
  );
}
