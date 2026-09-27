import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { agentRows, type Agent } from "../../shared/resources";
import { agentSidePane } from "../panes";
import { AgentDetail } from "./agent-detail";

export function AgentSideBody() {
  const { agentId } = agentSidePane.useParams();
  const result = useLive(agentRows);

  const title = matchResource(result, {
    pending: () => "Agent",
    ready: (agents) =>
      agents.find((a: Agent) => a.id === agentId)?.name ?? "Agent",
  });

  return (
    <PaneChrome pane={agentSidePane} title={title}>
      <AgentDetail agentId={agentId} />
    </PaneChrome>
  );
}
