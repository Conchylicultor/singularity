import { Shell as ShellCommands } from "@plugins/shell/web/commands";
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

export function TasksPanel({ selectedId }: { selectedId?: string }) {
  const lists = TasksSlots.List.useContributions();
  const views = TasksSlots.View.useContributions();

  TasksCommands.OpenTask.useHandler(({ id }) => {
    ShellCommands.OpenPane(tasksPane({ id: id ?? undefined }));
  });

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={55} minSize={25}>
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
      <ResizablePanel defaultSize={45} minSize={20}>
        <TaskView taskId={selectedId} views={views} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
