import {
  MdAdd,
  MdCancel,
  MdCheckCircle,
  MdIncompleteCircle,
  MdInput,
  MdPauseCircle,
  MdRadioButtonUnchecked,
  MdTimelapse,
} from "react-icons/md";
import type { IconType } from "react-icons";
import { useResource } from "@core";
import { TreeList } from "@plugins/tree/web";
import { tasksResource } from "../../shared/resources";
import { Tasks as TasksSlots } from "../slots";
import { taskDetailPane } from "../panes";
import { cn } from "@/lib/utils";

type TaskStatus =
  | "new"
  | "in_progress"
  | "need_action"
  | "attempted"
  | "done"
  | "held"
  | "dropped"
  | "blocked";

type Task = {
  id: string;
  parentId: string | null;
  title: string;
  rank: string;
  expanded: boolean;
  status: TaskStatus;
};

const STATUS_META: Record<
  TaskStatus,
  { icon: IconType; className: string; label: string }
> = {
  new: {
    icon: MdRadioButtonUnchecked,
    className: "text-muted-foreground/60",
    label: "New",
  },
  in_progress: {
    icon: MdTimelapse,
    className: "text-blue-600 dark:text-blue-400",
    label: "In progress",
  },
  need_action: {
    icon: MdInput,
    className: "text-orange-500 dark:text-orange-400",
    label: "Need action",
  },
  attempted: {
    icon: MdIncompleteCircle,
    className: "text-muted-foreground",
    label: "Attempted",
  },
  done: {
    icon: MdCheckCircle,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Done",
  },
  held: {
    icon: MdPauseCircle,
    className: "text-amber-600 dark:text-amber-400",
    label: "Held",
  },
  dropped: {
    icon: MdCancel,
    className: "text-muted-foreground/50",
    label: "Dropped",
  },
  blocked: {
    icon: MdPauseCircle,
    className: "text-zinc-500 dark:text-zinc-400",
    label: "Blocked",
  },
};

type TaskPatch = {
  title?: string;
  expanded?: boolean;
  parentId?: string | null;
  rank?: string;
};

async function patchTask(id: string, patch: TaskPatch) {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function createTaskRow(args: {
  parentId: string | null;
  rank?: string;
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

export function TasksList({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect?: (id: string) => void;
}) {
  const { data } = useResource(tasksResource);
  const rows = data ?? [];
  const actions = TasksSlots.TaskActions.useContributions();

  return (
    <TreeList<Task>
      rows={rows}
      rootId={rootTaskId}
      selectedId={selectedId}
      labelOf={(t) => t.title}
      onSelect={(id) =>
        onSelect ? onSelect(id) : taskDetailPane.open({ taskId: id })
      }
      onRename={(id, next) => patchTask(id, { title: next })}
      onToggleExpanded={(id, next) => patchTask(id, { expanded: next })}
      onMove={(id, dest) => patchTask(id, dest)}
      onCreate={createTaskRow}
      renderLeading={(t) => <StatusIcon status={t.status} />}
      renderActions={(t, ctx) =>
        actions.map((a) => (
          <a.component
            key={a.id}
            taskId={t.id}
            hasChildren={ctx.hasChildren}
          />
        ))
      }
      rowClassName={(t) =>
        t.status === "dropped"
          ? "text-muted-foreground/70 line-through italic"
          : t.status === "done"
            ? "text-muted-foreground"
            : undefined
      }
      rowMenu={(t, { addBelow }) => [
        {
          icon: MdAdd,
          label: "Add item below",
          onClick: () => addBelow(t.id),
        },
      ]}
      toolbar={{
        expandAll: true,
        hideTerminal: {
          isTerminal: (t) => t.status === "done" || t.status === "dropped",
        },
      }}
      addLabel={rootTaskId ? null : "Add"}
    />
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="flex size-5 shrink-0 items-center justify-center"
    >
      <Icon className={cn("size-4", meta.className)} />
    </span>
  );
}
