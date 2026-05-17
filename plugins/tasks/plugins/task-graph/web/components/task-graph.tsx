import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "dagre";
import {
  Background,
  ConnectionLineType,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { tasksResource, type Task } from "@plugins/tasks/core";
import { taskDetailPane, useTaskNavigate } from "@plugins/tasks/plugins/task-detail/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import { cn } from "@/lib/utils";
import { InsertableEdge, type InsertableEdgeData } from "./insertable-edge";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 36;
const NODE_TYPE = "task";

type TaskNodeData = {
  task: Task;
  selected: boolean;
  hasChildren: boolean;
};

type TaskFlowNode = Node<TaskNodeData, typeof NODE_TYPE>;

const GROUP_BG_TYPE = "groupBackground";
type GroupBgData = { groupId: string; label: string; depth: number };
type GroupBgNode = Node<GroupBgData, typeof GROUP_BG_TYPE>;

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
    if (t.groupId && byId.has(t.groupId)) stack.push(t.groupId);
  }
  return [...visited].map((id) => byId.get(id)).filter((t): t is Task => !!t);
}

function getGroupDepth(groupId: string, byId: Map<string, Task>): number {
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

function isNonBlocking(task: Task): boolean {
  return task.status === "done" || task.status === "dropped";
}

function layoutDag(
  closure: readonly Task[],
  allTasks: readonly Task[],
  selectedId: string,
  onNavigate: (taskId: string) => void,
) {
  // Sort by id for a stable node-insertion order regardless of which task is
  // selected as root (dagre's crossing-minimization is order-sensitive).
  const sorted = [...closure].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(sorted.map((t) => t.id));
  const childIds = new Set(allTasks.filter((t) => t.parentId).map((t) => t.parentId!));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 60, marginx: 12, marginy: 12 });

  for (const t of sorted) {
    g.setNode(t.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const t of sorted) {
    for (const dep of t.dependencies) {
      if (ids.has(dep)) g.setEdge(dep, t.id);
    }
  }
  dagre.layout(g);

  const nodes: TaskFlowNode[] = sorted.map((task) => {
    const pos = g.node(task.id);
    return {
      id: task.id,
      type: NODE_TYPE,
      data: { task, selected: task.id === selectedId, hasChildren: childIds.has(task.id) },
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const byId = new Map(sorted.map((t) => [t.id, t]));
  const edges: Edge<InsertableEdgeData>[] = [];
  for (const t of sorted) {
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
        type: "insertable",
        data: {
          sourceTaskId: dep,
          targetTaskId: t.id,
          targetParentId: byId.get(t.id)?.parentId ?? null,
          onNavigate,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        style: { stroke, strokeWidth: 1.5 },
      });
    }
  }

  // Group background nodes
  const groupMembers = new Map<string, string[]>();
  for (const t of sorted) {
    if (t.groupId && ids.has(t.groupId)) {
      const list = groupMembers.get(t.groupId) ?? [];
      list.push(t.id);
      groupMembers.set(t.groupId, list);
    }
  }
  // Include the anchor task itself in its group visual
  for (const [groupId, members] of groupMembers) {
    if (!members.includes(groupId)) members.push(groupId);
  }

  const GROUP_PAD = 16;
  const GROUP_LABEL_HEIGHT = 18;
  const bgNodes: GroupBgNode[] = [];
  for (const [groupId, memberIds] of groupMembers) {
    const positions = memberIds.map((id) => g.node(id)).filter(Boolean);
    if (positions.length === 0) continue;
    const anchor = byId.get(groupId);
    const depth = getGroupDepth(groupId, byId);
    const minX = Math.min(...positions.map((p) => p.x - NODE_WIDTH / 2)) - GROUP_PAD;
    const minY = Math.min(...positions.map((p) => p.y - NODE_HEIGHT / 2)) - GROUP_PAD - GROUP_LABEL_HEIGHT;
    const maxX = Math.max(...positions.map((p) => p.x + NODE_WIDTH / 2)) + GROUP_PAD;
    const maxY = Math.max(...positions.map((p) => p.y + NODE_HEIGHT / 2)) + GROUP_PAD;
    bgNodes.push({
      id: `group-${groupId}`,
      type: GROUP_BG_TYPE,
      data: { groupId, label: anchor?.title || "Group", depth },
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      selectable: false,
      draggable: false,
    });
  }
  bgNodes.sort((a, b) => a.data.depth - b.data.depth);

  return { nodes: [...bgNodes, ...nodes], edges };
}

function TaskNode({ data }: NodeProps<TaskFlowNode>) {
  const { task, selected, hasChildren } = data;
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const isTerminal = task.status === "done" || task.status === "dropped";
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren || deleting) return;
      setDeleting(true);
      void fetch(`/api/tasks/${task.id}`, { method: "DELETE" }).finally(() => {
        setDeleting(false);
      });
    },
    [task.id, hasChildren, deleting],
  );

  return (
    <div
      title={`${task.title} — ${meta.label}`}
      className={cn(
        "bg-card text-foreground relative flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 text-xs shadow-sm transition-colors",
        "hover:border-foreground/40 focus:outline-none",
        selected
          ? "border-primary ring-primary/30 ring-2"
          : "border-border",
        isTerminal && "text-muted-foreground",
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-1 !h-1"
      />
      <Icon className={cn("size-4 shrink-0", meta.iconClassName)} />
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
      {!hasChildren && (
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            top: -8,
            right: -8,
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms",
          }}
        >
          <button
            type="button"
            className="bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
            disabled={deleting}
            onClick={handleDelete}
            aria-label="Delete task"
          >
            <span className="text-xs font-medium leading-none">&times;</span>
          </button>
        </div>
      )}
    </div>
  );
}

const GROUP_PALETTE = [
  { bg: "bg-sky-500/8", border: "border-sky-500/30", text: "text-sky-600/70" },
  { bg: "bg-violet-500/8", border: "border-violet-500/30", text: "text-violet-600/70" },
  { bg: "bg-amber-500/8", border: "border-amber-500/30", text: "text-amber-600/70" },
  { bg: "bg-teal-500/8", border: "border-teal-500/30", text: "text-teal-600/70" },
];

function GroupBackground({ data }: NodeProps<GroupBgNode>) {
  const palette = GROUP_PALETTE[data.depth % GROUP_PALETTE.length]!;
  return (
    <div
      className={cn(
        "relative size-full rounded-lg border border-dashed pointer-events-none",
        palette.bg,
        palette.border,
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-2 max-w-[calc(100%-16px)] truncate text-[10px] font-medium leading-tight",
          palette.text,
        )}
      >
        {data.label}
      </span>
    </div>
  );
}

const NODE_TYPES = { [NODE_TYPE]: TaskNode, [GROUP_BG_TYPE]: GroupBackground };
const EDGE_TYPES = { insertable: InsertableEdge };

function TaskGraphInner({
  taskId,
  nodes,
  edges,
  onNavigate,
}: {
  taskId: string;
  nodes: Node[];
  edges: Edge[];
  onNavigate: (taskId: string) => void;
}) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-fit on container resize (initial layout settle, sidebar/pane toggles,
  // window resize) and whenever the node set changes (task switch).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame: number | null = null;
    const refit = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView({ padding: 0.15, maxZoom: 1 });
      });
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [taskId, nodes, fitView]);

  return (
    <div ref={containerRef} className="bg-muted/30 h-60 shrink-0 border-b">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => onNavigate(node.id)}
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

export function TaskGraph({ taskId }: { taskId: string }) {
  const tasksResult = useResource(tasksResource);
  const allTasks = useMemo(() => (tasksResult.pending ? [] : tasksResult.data), [tasksResult]);
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
  const { nodes, edges } = useMemo(
    () => layoutDag(closure, allTasks, taskId, onNavigate),
    [closure, allTasks, taskId, onNavigate],
  );

  if (closure.length <= 1) return null;

  return (
    <ReactFlowProvider>
      <TaskGraphInner taskId={taskId} nodes={nodes} edges={edges} onNavigate={onNavigate} />
    </ReactFlowProvider>
  );
}
