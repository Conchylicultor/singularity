import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { TasksList } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource } from "@plugins/tasks/shared";
import { TaskNavigateProvider } from "../context";
import { TaskDetail } from "./task-detail";

export function TaskTreeDetail({
  rootTaskId,
  selectedId,
  onSelect,
}: {
  rootTaskId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  useResource(tasksResource);

  return (
    <TaskNavigateProvider value={onSelect}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b p-2">
          <TasksList
            rootTaskId={rootTaskId}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <TaskDetail key={selectedId} taskId={selectedId} />
        </div>
      </div>
    </TaskNavigateProvider>
  );
}
