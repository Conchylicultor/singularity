import type { ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Outlet, Pane, PaneChrome, type, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { agentsResource, type Agent } from "../shared/resources";
import { Agents as AgentsSlots } from "./slots";
import { AgentsList } from "./components/agents-list";
import { AgentDetail } from "./components/agent-detail";

export const agentsRootPane = Pane.define({
  id: "agents-root",
  path: "/agents",
  component: AgentsRoot,
  // Layout container — owns the full-viewport split, so no chrome of its own.
  chrome: false,
});

export const agentDetailPane = Pane.define({
  id: "agent-detail",
  parent: agentsRootPane,
  path: ":id",
  component: AgentDetailBody,
  provides: type<{ agent: Agent }>(),
});

export const agentConversationPane = Pane.define({
  id: "agent-conversation",
  parent: agentDetailPane,
  path: "c/:convId",
  component: AgentConversationBody,
  // ConversationView owns its own PaneChrome (via conversationPane).
  chrome: false,
});

function AgentsRoot(): ReactElement {
  const lists = AgentsSlots.List.useContributions();
  const match = usePaneMatch();
  const selectedId = match?.chain.find(
    (e) => e.pane === agentDetailPane._internal,
  )?.params.id;
  const hasAgentSelected = selectedId !== undefined;

  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={25} minSize={15}>
          <div className="h-full overflow-auto p-4">
            <AgentsList selectedId={selectedId} />
            {lists.length > 0 && (
              <div className="mt-6 flex flex-col gap-4">
                {lists.map((l) => (
                  <l.component key={l.id} />
                ))}
              </div>
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={25}>
          {hasAgentSelected ? (
            <Outlet />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Select an agent
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function AgentDetailBody(): ReactElement {
  const { id } = agentDetailPane.useParams();
  const { data } = useResource(agentsResource);
  const agent = data?.find((a) => a.id === id) ?? null;
  const views = AgentsSlots.View.useContributions();

  const match = usePaneMatch();
  const hasConv = match?.chain.some(
    (e) => e.pane === agentConversationPane._internal,
  );

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

  const content: ReactElement = hasConv ? (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={55} minSize={25}>
        {body}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={45} minSize={25}>
        <Outlet />
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    body
  );

  const wrapped = (
    <PaneChrome pane={agentDetailPane} title={agent?.name}>
      {content}
    </PaneChrome>
  );

  if (!agent) return wrapped;
  return (
    <agentDetailPane.Provider value={{ agent }}>
      {wrapped}
    </agentDetailPane.Provider>
  );
}

function AgentConversationBody(): ReactElement {
  const { convId } = agentConversationPane.useParams();
  return <ConversationView key={convId} sessionId={convId} />;
}
