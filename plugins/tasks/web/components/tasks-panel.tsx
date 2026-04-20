import { useCallback, useEffect, useMemo, useState } from "react";
import { ShellCommands } from "@plugins/shell/web";
import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tasks as TasksSlots } from "../slots";
import { Tasks as TasksCommands } from "../commands";
import { tasksPane } from "../views";
import { TaskView } from "./task-view";
import { TasksList } from "./tasks-list";
import {
  ConversationPaneContext,
  type ConversationPaneController,
} from "./conversation-pane-context";

export function TasksPanel({ selectedId }: { selectedId?: string }) {
  const lists = TasksSlots.List.useContributions();
  const views = TasksSlots.View.useContributions();

  TasksCommands.OpenTask.useHandler(({ id }) => {
    ShellCommands.OpenPane(tasksPane({ id: id ?? undefined }));
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );

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
              <TasksList selectedId={selectedId} />
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
            <TaskView taskId={selectedId} views={views} />
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
