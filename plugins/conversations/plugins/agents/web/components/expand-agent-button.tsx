import {
  PaneIconAction,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { agentSidePane, agentDetailPane } from "../panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

const openInFullIcon = symbol("open-in-full");

export function ExpandAgentButton() {
  const { agentId } = agentSidePane.useParams();
  const openPane = useOpenPane();
  return (
    <PaneIconAction
      label="Expand"
      icon={openInFullIcon}
      {...openPane.link(agentDetailPane, { id: agentId }, { mode: "root" })}
    />
  );
}
