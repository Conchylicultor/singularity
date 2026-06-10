import { useMemo, useState } from "react";
import { MdWarningAmber } from "react-icons/md";
import { cn } from "@/lib/utils";
import type { Group, TracedGraph, TracedNode } from "../internal/trace-types";
import { WorkflowNodeCard, type NodeEmphasis } from "./workflow-node-card";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";

// A renderable block: either a leaf agent/workflow node or a concurrency group.
type Block =
  | { kind: "node"; node: TracedNode; order: number }
  | { kind: "group"; group: Group; children: Block[]; order: number };

export function WorkflowGraph({
  graph,
  activeNodeId,
  onOpenNode,
}: {
  graph: TracedGraph;
  activeNodeId?: string;
  onOpenNode: (nodeId: string) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const model = useMemo(() => buildModel(graph), [graph]);

  const focusId = hoverId ?? activeNodeId ?? null;
  const focusNode = focusId
    ? graph.nodes.find((n) => n.id === focusId)
    : undefined;

  const emphasisFor = (nodeId: string): NodeEmphasis => {
    if (!focusId || !focusNode) return "normal";
    if (nodeId === focusId) return "active";
    if (focusNode.deps.includes(nodeId)) return "dep";
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node?.deps.includes(focusId)) return "dependent";
    return "dim";
  };

  const renderBlock = (block: Block): React.ReactNode => {
    if (block.kind === "node") {
      return (
        <WorkflowNodeCard
          key={block.node.id}
          node={block.node}
          emphasis={emphasisFor(block.node.id)}
          onOpen={onOpenNode}
          onHover={setHoverId}
        />
      );
    }
    const { group, children } = block;
    if (group.kind === "parallel") {
      const count = countNodes(block);
      return (
        <div
          key={group.id}
          className="rounded-md border border-dashed border-border/70 p-2"
        >
          <div className="mb-1.5 text-3xs font-medium tracking-wider text-muted-foreground">
            ⇉ parallel ×{count}
            {graph.dynamic && "?"}
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {children.map(renderBlock)}
          </div>
        </div>
      );
    }
    // pipeline wrapper: children are stage groups → render as columns.
    return (
      <div
        key={group.id}
        className="rounded-md border border-dashed border-border/70 p-2"
      >
        <div className="mb-1.5 text-3xs font-medium tracking-wider text-muted-foreground">
          → pipeline
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          {children.map((stage, i) => (
            <div key={stage.kind === "group" ? stage.group.id : i} className="flex items-stretch gap-2">
              {i > 0 && (
                <span className="hidden self-center text-muted-foreground lg:block">
                  →
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {stage.kind === "group"
                  ? stage.children.map(renderBlock)
                  : renderBlock(stage)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {(graph.truncated || graph.dynamic) && (
        <div className="flex flex-col gap-1">
          {graph.truncated && (
            <Badge colorClass="bg-warning/10 text-warning" size="sm" icon={<MdWarningAmber />}>
              Graph truncated at the preview cap — see full script below.
            </Badge>
          )}
          {graph.dynamic && (
            <Badge variant="muted" size="sm">
              Some steps fan out at runtime; counts shown are representative.
            </Badge>
          )}
        </div>
      )}

      {model.lanes.map((lane, i) => (
        <div key={lane.title || `lane-${i}`}>
          {lane.title && (
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-categorical-6/15 font-mono text-3xs text-categorical-6">
                {lane.numberLabel}
              </span>
              <Text as="span" variant="label" className="text-foreground">
                {lane.title}
              </Text>
              {lane.detail && (
                <span className="min-w-0 truncate text-2xs text-muted-foreground">
                  {lane.detail}
                </span>
              )}
            </div>
          )}
          <div className={cn("space-y-1.5", lane.title && "ml-1.5 border-l border-border/50 pl-3")}>
            {lane.blocks.map(renderBlock)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- model building ---------------------------------------------------------

interface Lane {
  title: string;
  numberLabel: string;
  detail?: string;
  blocks: Block[];
}

function buildModel(graph: TracedGraph): { lanes: Lane[] } {
  const indexOf = new Map<string, number>();
  graph.nodes.forEach((n, i) => indexOf.set(n.id, i));

  const directNodes = new Map<string | undefined, TracedNode[]>();
  for (const n of graph.nodes) {
    const key = n.groupId;
    const list = directNodes.get(key) ?? [];
    list.push(n);
    directNodes.set(key, list);
  }
  const childGroups = new Map<string | undefined, Group[]>();
  for (const g of graph.groups) {
    const list = childGroups.get(g.parentGroupId) ?? [];
    list.push(g);
    childGroups.set(g.parentGroupId, list);
  }

  const groupOrder = (groupId: string): number => {
    let min = Infinity;
    for (const n of directNodes.get(groupId) ?? [])
      min = Math.min(min, indexOf.get(n.id) ?? Infinity);
    for (const g of childGroups.get(groupId) ?? [])
      min = Math.min(min, groupOrder(g.id));
    return min;
  };

  const buildGroup = (group: Group): Block => ({
    kind: "group",
    group,
    order: groupOrder(group.id),
    children: childrenOf(group.id),
  });

  function childrenOf(parentGroupId: string | undefined): Block[] {
    const blocks: Block[] = [];
    for (const n of directNodes.get(parentGroupId) ?? [])
      blocks.push({ kind: "node", node: n, order: indexOf.get(n.id) ?? 0 });
    for (const g of childGroups.get(parentGroupId) ?? [])
      blocks.push(buildGroup(g));
    return blocks.sort((a, b) => a.order - b.order);
  }

  // A top-level block (parentGroupId undefined) belongs to the phase of its
  // first descendant node.
  const phaseOfBlock = (block: Block): string => {
    const id = firstNodeId(block);
    return graph.nodes.find((n) => n.id === id)?.phase ?? "";
  };

  const topBlocks = childrenOf(undefined);

  // Lane order: graph.phases first, then any leftover (e.g. the "" bucket).
  const laneTitles: string[] = [];
  const seen = new Set<string>();
  for (const p of graph.phases) {
    if (!seen.has(p.title)) {
      seen.add(p.title);
      laneTitles.push(p.title);
    }
  }
  for (const b of topBlocks) {
    const t = phaseOfBlock(b);
    if (!seen.has(t)) {
      seen.add(t);
      laneTitles.push(t);
    }
  }

  let n = 0;
  const lanes: Lane[] = [];
  for (const title of laneTitles) {
    const blocks = topBlocks
      .filter((b) => phaseOfBlock(b) === title)
      .sort((a, b) => a.order - b.order);
    if (blocks.length === 0) continue;
    const detail = graph.phases.find((p) => p.title === title)?.detail;
    lanes.push({
      title,
      numberLabel: title ? String(++n) : "",
      detail,
      blocks,
    });
  }
  return { lanes };
}

function firstNodeId(block: Block): string {
  if (block.kind === "node") return block.node.id;
  return block.children.length ? firstNodeId(block.children[0]!) : "";
}

function countNodes(block: Block): number {
  if (block.kind === "node") return 1;
  return block.children.reduce((sum, c) => sum + countNodes(c), 0);
}
