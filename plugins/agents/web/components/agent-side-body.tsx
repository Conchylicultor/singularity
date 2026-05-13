import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { agentsResource, type Agent } from "@plugins/agents/shared/resources";
import { agentSidePane } from "../panes";
import { AgentDetail } from "./agent-detail";

export function AgentSideBody() {
  const { agentId } = agentSidePane.useParams();
  const { data } = useResource(agentsResource);
  const agent = data.find((a: Agent) => a.id === agentId);

  return (
    <PaneChrome pane={agentSidePane} title={agent?.name ?? "Agent"}>
      <div className="h-full min-h-0 overflow-auto">
        <AgentDetail agentId={agentId} />
      </div>
    </PaneChrome>
  );
}
