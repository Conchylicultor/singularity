import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { tasksResource, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { Tasks } from "../slots";
import { taskFields, taskHierarchy, buildTreeOptions } from "../internal/tasks-data-view";

const TASKS_SUBTREE_VIEW = defineDataView("tasks-subtree");

export function TasksSubtree({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(rows) => (
        <DataView<TaskListItem>
          rows={rows}
          fields={taskFields}
          rowKey={(t) => t.id}
          views={["tree"]}
          storageKey={TASKS_SUBTREE_VIEW}
          selectedRowId={selectedId}
          onRowActivate={(t) => onSelect(t.id)}
          selection={{}}
          hierarchy={taskHierarchy}
          viewOptions={{ tree: buildTreeOptions({ rootTaskId }) }}
          itemActions={Tasks.TaskActions}
        />
      )}
    </ResourceView>
  );
}
