import { MdAdd } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useTaskAutoStart } from "@plugins/tasks/plugins/auto-start/web";
import {
  RenameInput,
  RowChrome,
  TreeList,
  type TreeItem,
} from "@plugins/primitives/plugins/tree/web";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { TaskStatus } from "@plugins/tasks-core/core";
import { tasksResource } from "@plugins/tasks/core";
import { patchTask, setAutoStart } from "@plugins/tasks/web";
import { Tasks as TasksSlots } from "../slots";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import { cn } from "@/lib/utils";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

type Task = TreeItem & {
  title: string;
  status: TaskStatus;
};

async function createTaskRow(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string | null> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  const task = (await res.json()) as Task;
  return task.id;
}

function TaskRow({ node, depth }: { node: TreeNode<Task>; depth: number }) {
  const actions = TasksSlots.TaskActions.useContributions();
  const hasChildren = node.children.length > 0;
  const dropped = node.status === "dropped";
  const done = node.status === "done";
  const autoStart = useTaskAutoStart(node.id);
  const queuedModel = autoStart?.autoStartModel ?? null;
  return (
    <RowChrome
      node={node}
      depth={depth}
      menu={({ addBelow }) => [
        {
          icon: MdAdd,
          label: "Add item below",
          onClick: () => void addBelow(),
        },
      ]}
      actions={actions.map((a) => (
        <a.component
          key={a.id}
          taskId={node.id}
          hasChildren={hasChildren}
        />
      ))}
    >
      <StatusIcon status={node.status} />
      <RenameInput
        nodeId={node.id}
        value={node.title}
        onCommit={(next) => patchTask(node.id, { title: next })}
        className={cn(
          dropped && "text-muted-foreground/70 line-through italic",
          done && "text-muted-foreground",
        )}
      />
      {queuedModel && <QueuedChip taskId={node.id} model={queuedModel} />}
    </RowChrome>
  );
}

function QueuedChip({ taskId, model }: { taskId: string; model: "opus" | "sonnet" }) {
  const label = model === "opus" ? "Opus" : "Sonnet";
  return (
    <button
      type="button"
      title="Auto-start when parent is done — click to cancel"
      aria-label={`Cancel auto-start (${label})`}
      onClick={(e) => {
        e.stopPropagation();
        void setAutoStart(taskId, "none");
      }}
      className="ml-1 inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
    >
      Queued · {label}
    </button>
  );
}

export function TasksList({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const { data: rows } = useResource(tasksResource);
  const listActions = TasksSlots.ListActions.useContributions();

  return (
    <TreeList<Task>
      rows={rows}
      rootId={rootTaskId}
      selectedId={selectedId}
      onSelect={onSelect}
      onToggleExpanded={(id, next) => patchTask(id, { expanded: next })}
      onMove={(id, dest) => patchTask(id, dest)}
      onCreate={createTaskRow}
      Row={TaskRow}
      dragOverlay={(t) => t.title || "Untitled"}
      toolbar={{
        expandAll: true,
        search: { accessor: (t) => t.title },
        hideTerminal: {
          isTerminal: (t) => t.status === "done" || t.status === "dropped",
        },
        start: listActions.map((a) => <a.component key={a.id} />),
      }}
      addLabel={rootTaskId ? null : "Add"}
    />
  );
}
