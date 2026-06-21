import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useMemo, useState } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  GraphCanvas,
  type GraphCanvasNode,
  type GraphCanvasEdge,
  type GraphCanvasGroup,
} from "@plugins/primitives/plugins/graph-canvas/web";
import { addTaskDependency } from "@plugins/tasks/core";
import { tasksResource, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { patchTask } from "@plugins/tasks/web";
import { taskDetailPane, useTaskNavigate } from "@plugins/tasks/plugins/task-detail/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import { EdgeActions } from "./edge-actions";

function computeDagClosure(rootId: string, allTasks: readonly TaskListItem[]): TaskListItem[] {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const reverseDeps = new Map<string, string[]>();
  for (const t of allTasks) {
    for (const d of t.dependencies) {
      const arr = reverseDeps.get(d) ?? [];
      arr.push(t.id);
      reverseDeps.set(d, arr);
    }
  }
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const t = byId.get(id);
    if (!t) continue;
    for (const d of t.dependencies) {
      if (byId.has(d)) stack.push(d);
    }
    for (const r of reverseDeps.get(id) ?? []) stack.push(r);
    if (t.groupId && byId.has(t.groupId)) stack.push(t.groupId);
  }
  return [...visited].map((id) => byId.get(id)).filter((t): t is TaskListItem => !!t);
}

function getGroupDepth(groupId: string, byId: Map<string, TaskListItem>): number {
  let depth = 0;
  let current = groupId;
  const seen = new Set<string>();
  while (true) {
    const anchor = byId.get(current);
    if (!anchor?.groupId || seen.has(anchor.groupId)) break;
    seen.add(current);
    current = anchor.groupId;
    depth++;
  }
  return depth;
}

function isNonBlocking(task: TaskListItem): boolean {
  return task.status === "done" || task.status === "dropped";
}

const GROUP_PALETTE = [
  { bg: "bg-categorical-1/8 border-categorical-1/30", text: "text-categorical-1/70" },
  { bg: "bg-categorical-2/8 border-categorical-2/30", text: "text-categorical-2/70" },
  { bg: "bg-categorical-3/8 border-categorical-3/30", text: "text-categorical-3/70" },
  { bg: "bg-categorical-4/8 border-categorical-4/30", text: "text-categorical-4/70" },
];

/** Hover-revealed soft-drop button rendered as a node `actions` overlay. */
function DeleteTaskButton({ taskId }: { taskId: string }) {
  const [deleting, setDeleting] = useState(false);
  // "Delete" is a soft drop — marks the task dropped (reversible), never removing
  // the row. Tasks are never hard-deleted.
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (deleting) return;
      setDeleting(true);
      void patchTask(taskId, { drop: true }).finally(() => setDeleting(false));
    },
    [taskId, deleting],
  );
  return (
    <button
      type="button"
      className="bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground size-5 cursor-pointer rounded-full border shadow-sm disabled:opacity-50"
      disabled={deleting}
      onClick={handleDelete}
      aria-label="Delete task"
    >
      <Center className="size-full">
        <span className="text-caption font-medium">&times;</span>
      </Center>
    </button>
  );
}

function buildGraph(
  closure: readonly TaskListItem[],
  allTasks: readonly TaskListItem[],
  selectedId: string,
  onNavigate: (taskId: string) => void,
): { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[]; groups: GraphCanvasGroup[] } {
  const ids = new Set(closure.map((t) => t.id));
  const byId = new Map(closure.map((t) => [t.id, t]));
  const childIds = new Set(allTasks.filter((t) => t.folderId).map((t) => t.folderId!));

  const nodes: GraphCanvasNode[] = closure.map((task) => {
    const meta = STATUS_META[task.status];
    const Icon = meta.icon;
    const selected = task.id === selectedId;
    const isTerminal = task.status === "done" || task.status === "dropped";
    const hasChildren = childIds.has(task.id);
    return {
      id: task.id,
      label: task.title || "Untitled",
      title: `${task.title} — ${meta.label}`,
      tintClass: isTerminal ? "text-muted-foreground" : null,
      ringClass: selected ? "border-primary ring-primary/30 ring-2" : null,
      labelClassName: task.status === "dropped" ? "italic line-through" : null,
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid status icon in the graph node's leading slot (graph-canvas owns the row); must never shrink
      leading: <Icon className={cn("size-4 shrink-0", meta.iconClassName)} />,
      connectable: true,
      actions: hasChildren ? undefined : <DeleteTaskButton taskId={task.id} />,
    };
  });

  const edges: GraphCanvasEdge[] = [];
  for (const t of closure) {
    for (const dep of t.dependencies) {
      if (!ids.has(dep)) continue;
      const depTask = byId.get(dep)!;
      edges.push({
        from: dep,
        to: t.id,
        tone: isNonBlocking(depTask) ? "success" : "muted",
        actions: (
          <EdgeActions
            sourceTaskId={dep}
            targetTaskId={t.id}
            targetFolderId={t.folderId ?? null}
            onNavigate={onNavigate}
          />
        ),
      });
    }
  }

  // Groups: one background per groupId present in the closure, enclosing its
  // members plus the anchor task itself.
  const groupMembers = new Map<string, string[]>();
  for (const t of closure) {
    if (t.groupId && ids.has(t.groupId)) {
      const list = groupMembers.get(t.groupId) ?? [];
      list.push(t.id);
      groupMembers.set(t.groupId, list);
    }
  }
  for (const [groupId, members] of groupMembers) {
    if (!members.includes(groupId)) members.push(groupId);
  }
  const groups: GraphCanvasGroup[] = [...groupMembers.entries()]
    .map(([groupId, memberIds]) => ({ groupId, memberIds, depth: getGroupDepth(groupId, byId) }))
    // Shallower groups first so they render behind deeper (nested) ones.
    .sort((a, b) => a.depth - b.depth)
    .map(({ groupId, memberIds, depth }) => {
      const palette = GROUP_PALETTE[depth % GROUP_PALETTE.length]!;
      return {
        id: `group-${groupId}`,
        label: byId.get(groupId)?.title || "Group",
        memberIds,
        className: palette.bg,
        labelClassName: palette.text,
      };
    });

  return { nodes, edges, groups };
}

function TaskGraphLoaded({
  taskId,
  allTasks,
}: {
  taskId: string;
  allTasks: readonly TaskListItem[];
}) {
  const closure = useMemo(() => computeDagClosure(taskId, allTasks), [taskId, allTasks]);
  const ctxNavigate = useTaskNavigate();
  const openPane = useOpenPane();
  const onNavigate = useCallback(
    (id: string) => {
      if (ctxNavigate) ctxNavigate(id);
      else openPane(taskDetailPane, { taskId: id }, { mode: "swap" });
    },
    [ctxNavigate, openPane],
  );
  const onConnect = useCallback((source: string, target: string) => {
    void fetchEndpoint(addTaskDependency, { id: target }, { body: { dependsOnTaskId: source } });
  }, []);
  const { nodes, edges, groups } = useMemo(
    () => buildGraph(closure, allTasks, taskId, onNavigate),
    [closure, allTasks, taskId, onNavigate],
  );

  if (closure.length <= 1) return null;

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid fixed-height (h-60) graph band; shrink-0 keeps it from being compressed among the stacked detail sections
    <div className="bg-muted/30 h-60 shrink-0 border-b">
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        groups={groups}
        connectable
        onConnect={onConnect}
        onNodeClick={onNavigate}
        edgePath="smoothstep"
        minZoom={0.5}
      />
    </div>
  );
}

export function TaskGraph({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);
  return (
    <ResourceView resource={tasksResult}>
      {(allTasks) => <TaskGraphLoaded taskId={taskId} allTasks={allTasks} />}
    </ResourceView>
  );
}
