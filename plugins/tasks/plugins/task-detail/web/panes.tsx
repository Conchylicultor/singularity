import { type ReactElement, useMemo } from "react";
import { Outlet, Pane, PaneChrome, type, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import {
  Tasks as TasksSlots,
  TasksList,
} from "@plugins/tasks/plugins/task-list/web";
import { type Task } from "@plugins/tasks/shared";
import { useTask } from "@plugins/tasks/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TaskDetail as TaskDetailSlots } from "./slots";
import { TaskDetailFilePeekProvider, useTaskDetailFilePeek } from "./context";
import { TaskDetail } from "./components/task-detail";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const tasksRootPane = Pane.define({
  id: "tasks-root",
  path: "/tasks",
  component: TasksRoot,
  // Layout container — owns the full-viewport split, so no chrome of its own.
  chrome: false,
});

export const taskDetailPane = Pane.define({
  id: "task-detail",
  parent: tasksRootPane,
  path: ":taskId",
  component: TaskDetailBody,
  provides: type<{ task: Task }>(),
});

export const taskConversationPane = Pane.define({
  id: "task-conversation",
  parent: taskDetailPane,
  path: "c/:convId",
  component: TaskConversationBody,
  // ConversationView owns its own PaneChrome (via conversationPane).
  chrome: false,
});

function TasksRoot(): ReactElement {
  const lists = TasksSlots.List.useContributions();
  const match = usePaneMatch();
  const hasTaskSelected = match?.chain.some(
    (e) => e.pane === taskDetailPane._internal,
  );
  const selectedId = match?.chain.find(
    (e) => e.pane === taskDetailPane._internal,
  )?.params.taskId;

  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={25} minSize={15}>
          <div className="h-full overflow-auto p-4">
            <TasksList
              selectedId={selectedId}
              onSelect={(id) => taskDetailPane.open({ taskId: id })}
            />
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
          {hasTaskSelected ? (
            <Outlet />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Select a task
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function TaskDetailBody(): ReactElement {
  return (
    <TaskDetailFilePeekProvider>
      <TaskDetailBodyContent />
    </TaskDetailFilePeekProvider>
  );
}

function TaskDetailBodyContent(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const task = useTask(taskId);
  const { filePath } = useTaskDetailFilePeek();
  const sidePanels = TaskDetailSlots.SidePanel.useContributions();
  const orderedSidePanels = useMemo(
    () => [...sidePanels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sidePanels],
  );
  const aboveBands = TaskDetailSlots.Above.useContributions();
  const orderedAbove = useMemo(
    () => [...aboveBands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [aboveBands],
  );

  const match = usePaneMatch();
  const hasConv = match?.chain.some(
    (e) => e.pane === taskConversationPane._internal,
  );

  const body = (
    <div className="flex h-full flex-col overflow-hidden">
      {orderedAbove.map((band) => (
        <band.component key={band.id} taskId={taskId} />
      ))}
      <div className="min-h-0 flex-1 overflow-auto">
        <TaskDetail key={taskId} taskId={taskId} />
      </div>
    </div>
  );

  const showSidePanel = filePath !== null;
  const rightPanel = showSidePanel ? (
    <>
      {orderedSidePanels.map((s) => (
        <s.component key={s.id} taskId={taskId} />
      ))}
    </>
  ) : hasConv ? (
    <Outlet />
  ) : null;

  const content: ReactElement =
    rightPanel !== null ? (
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={55} minSize={25}>
          {body}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={45} minSize={25}>
          {rightPanel}
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      body
    );

  const wrapped = (
    <PaneChrome pane={taskDetailPane} title={task?.title}>
      {content}
    </PaneChrome>
  );

  // Only mount the Provider once the task is loaded so descendants reading
  // useData() get a non-null task.
  if (!task) return wrapped;
  return (
    <taskDetailPane.Provider value={{ task }}>{wrapped}</taskDetailPane.Provider>
  );
}

function TaskConversationBody(): ReactElement {
  const { convId } = taskConversationPane.useParams();
  return <ConversationView key={convId} sessionId={convId} />;
}
