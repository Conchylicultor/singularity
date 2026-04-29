import { useMemo } from "react";
import dagre from "dagre";
import {
  Background,
  ConnectionLineType,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, type Task } from "@plugins/tasks/shared";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-list/web";
import { cn } from "@/lib/utils";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 36;
const NODE_TYPE = "task";

type TaskNodeData = {
  task: Task;
  selected: boolean;
};

type TaskFlowNode = Node<TaskNodeData, typeof NODE_TYPE>;

function computeDagClosure(rootId: string, allTasks: readonly Task[]): Task[] {
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
  }
  return [...visited].map((id) => byId.get(id)).filter((t): t is Task => !!t);
}

function isNonBlocking(task: Task): boolean {
  return task.status === "done" || task.status === "dropped";
}

function layoutDag(closure: readonly Task[], selectedId: string) {
  const ids = new Set(closure.map((t) => t.id));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 60, marginx: 12, marginy: 12 });

  for (const t of closure) {
    g.setNode(t.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const t of closure) {
    for (const dep of t.dependencies) {
      if (ids.has(dep)) g.setEdge(dep, t.id);
    }
  }
  dagre.layout(g);

  const nodes: TaskFlowNode[] = closure.map((task) => {
    const pos = g.node(task.id);
    return {
      id: task.id,
      type: NODE_TYPE,
      data: { task, selected: task.id === selectedId },
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const byId = new Map(closure.map((t) => [t.id, t]));
  const edges: Edge[] = [];
  for (const t of closure) {
    for (const dep of t.dependencies) {
      if (!ids.has(dep)) continue;
      const depTask = byId.get(dep)!;
      const satisfied = isNonBlocking(depTask);
      const stroke = satisfied
        ? "var(--color-emerald-500, #10b981)"
        : "var(--color-zinc-400, #a1a1aa)";
      edges.push({
        id: `${dep}->${t.id}`,
        source: dep,
        target: t.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        style: { stroke, strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

function TaskNode({ data }: NodeProps<TaskFlowNode>) {
  const { task, selected } = data;
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const isTerminal = task.status === "done" || task.status === "dropped";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => taskDetailPane.open({ taskId: task.id })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          taskDetailPane.open({ taskId: task.id });
        }
      }}
      title={`${task.title} — ${meta.label}`}
      className={cn(
        "bg-card text-foreground flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 text-xs shadow-sm transition-colors",
        "hover:border-foreground/40 focus:outline-none",
        selected
          ? "border-primary ring-primary/30 ring-2"
          : "border-border",
        isTerminal && "text-muted-foreground",
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-1 !h-1"
      />
      <Icon className={cn("size-4 shrink-0", meta.className)} />
      <span
        className={cn(
          "truncate",
          task.status === "dropped" && "italic line-through",
        )}
      >
        {task.title || "Untitled"}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !w-1 !h-1"
      />
    </div>
  );
}

const NODE_TYPES = { [NODE_TYPE]: TaskNode };

export function TaskGraph({ taskId }: { taskId: string }) {
  const { data } = useResource(tasksResource);
  const allTasks = data ?? [];
  const closure = useMemo(() => computeDagClosure(taskId, allTasks), [taskId, allTasks]);
  const { nodes, edges } = useMemo(
    () => layoutDag(closure, taskId),
    [closure, taskId],
  );

  if (closure.length <= 1) return null;

  return (
    <div className="bg-muted/30 h-60 shrink-0 border-b">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        connectionLineType={ConnectionLineType.SmoothStep}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
