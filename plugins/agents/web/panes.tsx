import type { ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Pane, PaneChrome, type, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import {
  conversationPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import { AgentSideBody } from "./components/agent-side-body";
import { agentsResource, type Agent } from "@plugins/agents/shared/resources";
import { Agents as AgentsSlots } from "./slots";
import { AgentsList } from "./components/agents-list";
import { AgentDetail } from "./components/agent-detail";
import { SystemAgentDetail } from "./components/system-agent-detail";

export const agentsRootPane = Pane.define({
  id: "agents-root",
  after: [null],
  segment: "agents",
  component: AgentsRoot,
  // No chrome; the agents list is its own UI.
  chrome: false,
  width: 320,
});

export const agentDetailPane = Pane.define({
  id: "agent-detail",
  after: [agentsRootPane],
  segment: "a/:id",
  component: AgentDetailBody,
  provides: type<{ agent: Agent }>(),
  width: 360,
});

export const systemAgentDetailPane = Pane.define({
  id: "agent-system-detail",
  after: [agentsRootPane],
  segment: "system/:systemId",
  component: SystemAgentDetailBody,
});

export const agentSidePane = Pane.define({
  id: "agent-side",
  after: [conversationPane],
  segment: "agent/:agentId",
  component: AgentSideBody,
  chrome: {
    history: false,
    promote: false,
  },
});

function AgentsRoot(): ReactElement {
  const lists = AgentsSlots.List.useContributions();
  const match = usePaneMatch();
  const selectedUserId = match?.chain.find(
    (e) => e.pane === agentDetailPane._internal,
  )?.params.id;
  const selectedSystemId = match?.chain.find(
    (e) => e.pane === systemAgentDetailPane._internal,
  )?.params.systemId;

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
  const { data } = useResource(agentsResource);
  const agent = data.find((a: Agent) => a.id === id) ?? null;
  const views = AgentsSlots.View.useContributions();

  const body = (
    <div className="h-full overflow-auto">
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
    </div>
  );

  const wrapped = (
    <PaneChrome pane={agentDetailPane} title={agent?.name}>
      {body}
    </PaneChrome>
  );

  if (!agent) return wrapped;
  return (
    <agentDetailPane.Provider value={{ agent }}>
      {wrapped}
    </agentDetailPane.Provider>
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
      <div className="h-full overflow-auto">
        <Component descriptor={descriptor} />
      </div>
    </PaneChrome>
  );
}
