import { type ReactElement, useState } from "react";
import { useResource } from "@core";
import { Outlet, Pane, PaneChrome, type, usePaneMatch } from "@plugins/pane/web";
import { ConversationView } from "@plugins/conversations/plugins/conversation-view/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { tasksResource, type Task } from "../shared/resources";
import { Tasks as TasksSlots } from "./slots";
import { TasksList } from "./components/tasks-list";
import { TaskDetail } from "./components/task-detail";
import { TaskFilePeek } from "./components/task-file-peek";

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
  const { taskId } = taskDetailPane.useParams();
  const { data } = useResource(tasksResource);
  const task = data?.find((t) => t.id === taskId) ?? null;
  const views = TasksSlots.View.useContributions();
  const [filePeekPath, setFilePeekPath] = useState<string | null>(null);

  const match = usePaneMatch();
  const hasConv = match?.chain.some(
    (e) => e.pane === taskConversationPane._internal,
  );

  const body = (
    <div className="h-full overflow-auto">
      <TaskDetail key={taskId} taskId={taskId} onFileOpen={setFilePeekPath} />
      {views.length > 0 && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          {views.map((v) => (
            <section key={v.id} className="bg-card rounded-lg border p-4">
              {v.title ? (
                <h2 className="mb-4 text-sm font-medium">{v.title}</h2>
              ) : null}
              <v.component taskId={taskId} />
            </section>
          ))}
        </div>
      )}
    </div>
  );

  const rightPanel =
    filePeekPath !== null ? (
      <TaskFilePeek path={filePeekPath} onClose={() => setFilePeekPath(null)} />
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
