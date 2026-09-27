import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { agentSidePane } from "../panes";
import { AgentDetail } from "./agent-detail";

export function AgentSideBody() {
  const { agentId } = agentSidePane.useParams();

  return (
    <PaneChrome pane={agentSidePane}>
      <AgentDetail agentId={agentId} />
    </PaneChrome>
  );
}
