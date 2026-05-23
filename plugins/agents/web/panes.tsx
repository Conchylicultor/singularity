import type { ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { AgentSideBody } from "./components/agent-side-body";
import { agentsResource, type Agent } from "../shared/resources";
import { Agents as AgentsSlots } from "./slots";
import { AgentsList } from "./components/agents-list";
import { AgentDetail } from "./components/agent-detail";
import { SystemAgentDetail } from "./components/system-agent-detail";

export const agentsRootPane = Pane.define({
  id: "agents-root",
  segment: "agents",
  component: AgentsRoot,
  // No chrome; the agents list is its own UI.
  chrome: false,
  width: 320,
});

function useResolveAgent({ id }: { id: string }) {
  const result = useResource(agentsResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((a) => a.id === id) };
}

export const agentDetailPane = Pane.define({
  id: "agent-detail",
  defaultAncestors: [agentsRootPane],
  segment: "ag/:id",
  component: AgentDetailBody,
  width: 360,
  resolve: useResolveAgent,
});

export const systemAgentDetailPane = Pane.define({
  id: "agent-system-detail",
  defaultAncestors: [agentsRootPane],
  segment: "system/:systemId",
  component: SystemAgentDetailBody,
  resolve: false,
});

export const agentSidePane = Pane.define({
  id: "agent-side",
  segment: "agent/:agentId",
  component: AgentSideBody,
  chrome: {
    history: false,
    promote: false,
  },
  resolve: false,
});

function AgentsRoot(): ReactElement {
  const lists = AgentsSlots.List.useContributions();
  const selectedUserId = agentDetailPane.useChainEntry()?.params.id;
  const selectedSystemId = systemAgentDetailPane.useChainEntry()?.params.systemId;

  return (
    <div className="h-full overflow-auto p-4">
      <AgentsList
        selectedId={selectedUserId}
        selectedSystemId={selectedSystemId}
      />
      {lists.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {lists.map((l) => (
            <l.component key={l.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentDetailBody(): ReactElement {
  const { id } = agentDetailPane.useParams();
  const agentsResult = useResource(agentsResource);
  const agent = agentsResult.pending ? null : (agentsResult.data.find((a: Agent) => a.id === id) ?? null);
  const views = AgentsSlots.View.useContributions();

  return (
    <PaneChrome pane={agentDetailPane} title={agent?.name}>
      <AgentDetail key={id} agentId={id} />
      {views.length > 0 && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          {views.map((v) => (
            <section key={v.id} className="bg-card rounded-lg border p-4">
              {v.title ? (
                <h2 className="mb-4 text-sm font-medium">{v.title}</h2>
              ) : null}
              <v.component agentId={id} />
            </section>
          ))}
        </div>
      )}
    </PaneChrome>
  );
}

function SystemAgentDetailBody(): ReactElement {
  const { systemId } = systemAgentDetailPane.useParams();
  const descriptors = AgentsSlots.SystemAgent.useContributions();
  const descriptor = descriptors.find((d) => d.id === systemId);

  if (!descriptor) {
    return (
      <PaneChrome pane={systemAgentDetailPane} title="Unknown system agent">
        <Placeholder>
          No system agent registered with id <code>{systemId}</code>.
        </Placeholder>
      </PaneChrome>
    );
  }

  const Component = descriptor.component ?? SystemAgentDetail;
  return (
    <PaneChrome pane={systemAgentDetailPane} title={descriptor.name}>
      <Component descriptor={descriptor} />
    </PaneChrome>
  );
}
