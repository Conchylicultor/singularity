import { MdOpenInFull } from "react-icons/md";
import { PaneIconAction, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { agentSidePane, agentDetailPane } from "../panes";

export function ExpandAgentButton() {
  const { agentId } = agentSidePane.useParams();
  const openPane = useOpenPane();
  return (
    <PaneIconAction
      label="Expand"
      icon={MdOpenInFull}
      onClick={() => openPane(agentDetailPane, { id: agentId }, { mode: "root" })}
    />
  );
}
