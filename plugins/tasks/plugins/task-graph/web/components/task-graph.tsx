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
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { tasksResource, type TaskListItem, addTaskDependency } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";
import { taskDetailPane, useTaskNavigate } from "@plugins/tasks/plugins/task-detail/web";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";
import { cn } from "@/lib/utils";
import { InsertableEdge, type InsertableEdgeData } from "./insertable-edge";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 36;
const NODE_TYPE = "task";

type TaskNodeData = {
  task: TaskListItem;
  selected: boolean;
  hasChildren: boolean;
};

type TaskFlowNode = Node<TaskNodeData, typeof NODE_TYPE>;

const GROUP_BG_TYPE = "groupBackground";
type GroupBgData = { groupId: string; label: string; depth: number };
type GroupBgNode = Node<GroupBgData, typeof GROUP_BG_TYPE>;

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

function layoutDag(
  closure: readonly TaskListItem[],
  allTasks: readonly TaskListItem[],
  selectedId: string,
  onNavigate: (taskId: string) => void,
) {
  // Sort by id for a stable node-insertion order regardless of which task is
  // selected as root (dagre's crossing-minimization is order-sensitive).
  const sorted = [...closure].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(sorted.map((t) => t.id));
  const childIds = new Set(allTasks.filter((t) => t.folderId).map((t) => t.folderId!));
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
        ? "var(--success)"
        : "var(--muted-foreground)";
      edges.push({
        id: `${dep}->${t.id}`,
        source: dep,
        target: t.id,
        type: "insertable",
        data: {
          sourceTaskId: dep,
          targetTaskId: t.id,
          targetFolderId: byId.get(t.id)?.folderId ?? null,
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
      style: { width: maxX - minX, height: maxY - minY, pointerEvents: "none" },
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

  // "Delete" is a soft drop — marks the task dropped (reversible), never
  // removing the row. Tasks are never hard-deleted.
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (deleting) return;
      setDeleting(true);
      void patchTask(task.id, { drop: true }).finally(() => {
        setDeleting(false);
      });
    },
    [task.id, deleting],
  );

  return (
    <div
      title={`${task.title} — ${meta.label}`}
      className={cn(
        "bg-card text-foreground relative flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 text-caption shadow-sm transition-colors",
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
        className="!bg-muted-foreground/60 !border-border !w-2.5 !h-2.5 !rounded-full"
        style={{ opacity: hovered ? 1 : 0, transition: "opacity 150ms", cursor: "crosshair" }}
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
        className="!bg-muted-foreground/60 !border-border !w-2.5 !h-2.5 !rounded-full"
        style={{ opacity: hovered ? 1 : 0, transition: "opacity 150ms", cursor: "crosshair" }}
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
            <span className="text-caption font-medium">&times;</span>
          </button>
        </div>
      )}
    </div>
  );
}

const GROUP_PALETTE = [
  { bg: "bg-categorical-1/8", border: "border-categorical-1/30", text: "text-categorical-1/70" },
  { bg: "bg-categorical-2/8", border: "border-categorical-2/30", text: "text-categorical-2/70" },
  { bg: "bg-categorical-3/8", border: "border-categorical-3/30", text: "text-categorical-3/70" },
  { bg: "bg-categorical-4/8", border: "border-categorical-4/30", text: "text-categorical-4/70" },
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
          "absolute top-1 left-2 max-w-[calc(100%-16px)] truncate text-3xs font-medium",
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
  onConnect,
}: {
  taskId: string;
  nodes: Node[];
  edges: Edge[];
  onNavigate: (taskId: string) => void;
  onConnect: (connection: Connection) => void;
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
        nodesConnectable
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => {
          if (node.type === NODE_TYPE) onNavigate(node.id);
        }}
        onConnect={onConnect}
        connectionRadius={20}
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
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      void fetchEndpoint(addTaskDependency, { id: connection.target }, { body: { dependsOnTaskId: connection.source } });
    },
    [],
  );
  const { nodes, edges } = useMemo(
    () => layoutDag(closure, allTasks, taskId, onNavigate),
    [closure, allTasks, taskId, onNavigate],
  );

  if (closure.length <= 1) return null;

  return (
    <ReactFlowProvider>
      <TaskGraphInner taskId={taskId} nodes={nodes} edges={edges} onNavigate={onNavigate} onConnect={onConnect} />
    </ReactFlowProvider>
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
