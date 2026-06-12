import type { ReactElement } from "react";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
  const selectedUserId = agentDetailPane.useRouteEntry()?.params.id;
  const selectedSystemId = systemAgentDetailPane.useRouteEntry()?.params.systemId;

  return (
    <div className="h-full overflow-auto p-4">
      <AgentsList
        selectedId={selectedUserId}
        selectedSystemId={selectedSystemId}
      />
      <div className="mt-6 flex flex-col gap-4">
        <AgentsSlots.List.Render />
      </div>
    </div>
  );
}

function AgentDetailBody(): ReactElement {
  const { id } = agentDetailPane.useParams();
  const agentsResult = useResource(agentsResource);
  const title = matchResource(agentsResult, {
    pending: () => undefined,
    ready: (agents) => agents.find((a: Agent) => a.id === id)?.name,
  });

  return (
    <PaneChrome pane={agentDetailPane} title={title}>
      <AgentDetail key={id} agentId={id} />
      <div className="flex flex-col gap-4 px-6 pb-6">
        <AgentsSlots.View.Render>
          {(v) => (
            <section className="bg-card rounded-lg border p-4">
              {v.title ? (
                <Text as="h2" variant="label" className="mb-4">{v.title}</Text>
              ) : null}
              <v.component agentId={id} />
            </section>
          )}
        </AgentsSlots.View.Render>
      </div>
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

  return (
    <PaneChrome pane={systemAgentDetailPane} title={descriptor.name}>
      <AgentsSlots.SystemAgent.Render>
        {(d) =>
          d.id === systemId
            ? d.component
              ? <d.component descriptor={d} />
              : <SystemAgentDetail descriptor={d} />
            : null
        }
      </AgentsSlots.SystemAgent.Render>
    </PaneChrome>
  );
}
