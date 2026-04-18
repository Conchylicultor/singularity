import { useCallback, useEffect, useMemo, useState } from "react";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web/components/conversation-view";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Agents as AgentsCommands } from "../commands";
import { Agents as AgentsSlots } from "../slots";
import { agentsPane } from "../views";
import { AgentsList } from "./agents-list";
import { AgentDetail } from "./agent-detail";
import {
  ConversationPaneContext,
  type ConversationPaneController,
} from "./conversation-pane-context";

export function AgentsPanel({ selectedId }: { selectedId?: string }) {
  const lists = AgentsSlots.List.useContributions();
  const views = AgentsSlots.View.useContributions();

  AgentsCommands.OpenAgent.useHandler(({ id }) => {
    ShellCommands.OpenPane(agentsPane({ id: id ?? undefined }));
  });

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setActiveConversationId(null);
  }, [selectedId]);

  const open = useCallback((id: string) => {
    setActiveConversationId((prev) => (prev === id ? null : id));
  }, []);
  const close = useCallback(() => setActiveConversationId(null), []);

  const controller = useMemo<ConversationPaneController>(
    () => ({ activeId: activeConversationId, open, close }),
    [activeConversationId, open, close],
  );

  return (
    <ConversationPaneContext.Provider value={controller}>
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
          <ResizablePanel
            defaultSize={activeConversationId ? 40 : 75}
            minSize={25}
          >
            <AgentView agentId={selectedId} views={views} />
          </ResizablePanel>
          {activeConversationId && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={25}>
                <ConversationView
                  key={activeConversationId}
                  sessionId={activeConversationId}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </ConversationPaneContext.Provider>
  );
}

type ViewContribution = {
  id: string;
  title?: string;
  component: React.ComponentType<{ agentId: string }>;
};

function AgentView({
  agentId,
  views,
}: {
  agentId: string | undefined;
  views: readonly ViewContribution[];
}) {
  if (!agentId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        Select an agent
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      <AgentDetail key={agentId} agentId={agentId} />
      {views.length > 0 && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          {views.map((v) => (
            <section key={v.id} className="bg-card rounded-lg border p-4">
              {v.title ? (
                <h2 className="mb-4 text-sm font-medium">{v.title}</h2>
              ) : null}
              <v.component agentId={agentId} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
