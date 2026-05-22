import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { agentsResource, type Agent } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { AgentDetail } from "./agent-detail";

export function AgentSideBody() {
  const { agentId } = agentSidePane.useParams();
  const result = useResource(agentsResource);
  const agent = result.pending ? undefined : result.data.find((a: Agent) => a.id === agentId);

  return (
    <PaneChrome pane={agentSidePane} title={agent?.name ?? "Agent"}>
      <AgentDetail agentId={agentId} />
    </PaneChrome>
  );
}
