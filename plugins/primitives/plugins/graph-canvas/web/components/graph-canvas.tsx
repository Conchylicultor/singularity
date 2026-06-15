import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import dagre from "dagre";
import {
  Background,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CanvasNode,
  CANVAS_NODE_TYPE,
  NODE_HEIGHT,
  NODE_WIDTH,
  type CanvasFlowNode,
} from "./canvas-node";

/** A single node in the generic graph canvas. */
export interface GraphCanvasNode {
  id: string;
  label: string;
  /** Tooltip (e.g. full id). Falls back to `label`. */
  title?: string;
  /** Background tint (Tailwind class). */
  tintClass?: string | null;
  /** Emphasis ring (focus / entry, Tailwind class). */
  ringClass?: string | null;
  /** Optional corner content. */
  badge?: ReactNode;
}

/** A single directed edge `from → to` in the generic graph canvas. */
export interface GraphCanvasEdge {
  from: string;
  to: string;
  /** Generic style; consumers map domain kinds onto this (e.g. hard→solid, soft→dashed). */
  variant?: "solid" | "dashed";
  emphasized?: boolean;
}

export interface GraphCanvasProps {
  nodes: GraphCanvasNode[];
  edges: GraphCanvasEdge[];
  /** Node to emphasize + fit around. */
  focusId?: string;
  /** dagre rankdir, default "LR". */
  direction?: "LR" | "TB";
  onNodeClick?: (id: string) => void;
}

const NODE_TYPES = { [CANVAS_NODE_TYPE]: CanvasNode };

function layout(
  nodes: GraphCanvasNode[],
  edges: GraphCanvasEdge[],
  direction: "LR" | "TB",
): { flowNodes: Node[]; flowEdges: Edge[] } {
  // Sort by id for a stable node-insertion order regardless of focus (dagre's
  // crossing-minimization is order-sensitive).
  const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(sorted.map((n) => n.id));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 24, ranksep: 60, marginx: 12, marginy: 12 });

  for (const n of sorted) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);

  const isLR = direction === "LR";
  const flowNodes: CanvasFlowNode[] = sorted.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: CANVAS_NODE_TYPE,
      data: {
        label: n.label,
        title: n.title,
        tintClass: n.tintClass,
        ringClass: n.ringClass,
        badge: n.badge,
      },
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      sourcePosition: isLR ? Position.Right : Position.Bottom,
      targetPosition: isLR ? Position.Left : Position.Top,
    };
  });

  const flowEdges: Edge[] = edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => {
      const dashed = e.variant === "dashed";
      const stroke = dashed ? "var(--muted-foreground)" : "var(--foreground)";
      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
        style: {
          stroke,
          strokeWidth: e.emphasized ? 2 : 1.5,
          strokeDasharray: dashed ? "4 3" : undefined,
        },
      };
    });

  return { flowNodes, flowEdges };
}

function GraphCanvasInner({
  flowNodes,
  flowEdges,
  focusId,
  fitKey,
  onNodeClick,
}: {
  flowNodes: Node[];
  flowEdges: Edge[];
  focusId?: string;
  fitKey: string;
  onNodeClick?: (id: string) => void;
}) {
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-fit on container resize (initial settle, pane/sidebar toggles, window
  // resize) and whenever the node set / focus changes.
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
  }, [fitKey, focusId, fitView]);

  return (
    <div ref={containerRef} className="bg-muted/30 size-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export function GraphCanvas({ nodes, edges, focusId, direction = "LR", onNodeClick }: GraphCanvasProps) {
  const { flowNodes, flowEdges } = useMemo(
    () => layout(nodes, edges, direction),
    [nodes, edges, direction],
  );
  // A cheap key that changes whenever the node set changes, so the inner re-fits.
  const fitKey = useMemo(() => nodes.map((n) => n.id).join("|"), [nodes]);

  return (
    <ReactFlowProvider>
      <GraphCanvasInner
        flowNodes={flowNodes}
        flowEdges={flowEdges}
        focusId={focusId}
        fitKey={fitKey}
        onNodeClick={onNodeClick}
      />
    </ReactFlowProvider>
  );
}
