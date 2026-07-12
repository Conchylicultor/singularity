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
import {
  tasksResource,
  TaskGraph as TaskGraphValue,
  isSettled,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { patchTask } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import { EdgeActions } from "./edge-actions";

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
    const isTerminal = isSettled(task.status);
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
        tone: isSettled(depTask.status) ? "success" : "muted",
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
  const closure = useMemo(() => {
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    const root = byId.get(taskId);
    // closure() excludes the queried id; re-include the root so it renders.
    const ids = TaskGraphValue.from(allTasks)
      .closure(taskId, { includeGroups: true })
      .map((n) => n.id);
    return [...(root ? [taskId] : []), ...ids]
      .map((id) => byId.get(id))
      .filter((t): t is TaskListItem => !!t);
  }, [taskId, allTasks]);
  // Clicking a node re-roots this pane in place, keeping the URL truthful.
  const openPane = useOpenPane();
  const onNavigate = useCallback(
    (id: string) => openPane(taskDetailPane, { taskId: id }, { mode: "swap" }),
    [openPane],
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
    // Self-contained card: the graph is the last detail section, so it carries
    // its own frame rather than relying on being the band at the top.
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid fixed-height (h-60) graph card; shrink-0 keeps it from being compressed among the stacked detail sections
    <Clip className="bg-muted/30 h-60 shrink-0 rounded-lg border">
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
    </Clip>
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
