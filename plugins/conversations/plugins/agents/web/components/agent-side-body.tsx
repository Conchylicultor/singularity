import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { agentsResource, type Agent } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { AgentDetail } from "./agent-detail";

export function AgentSideBody() {
  const { agentId } = agentSidePane.useParams();
  const result = useResource(agentsResource);

  const title = matchResource(result, {
    pending: () => "Agent",
    ready: (agents) => agents.find((a: Agent) => a.id === agentId)?.name ?? "Agent",
  });

  return (
    <PaneChrome pane={agentSidePane} title={title}>
      <AgentDetail agentId={agentId} />
    </PaneChrome>
  );
}
