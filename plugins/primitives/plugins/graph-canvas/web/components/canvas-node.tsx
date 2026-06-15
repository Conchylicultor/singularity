import type { ReactNode } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";

export const CANVAS_NODE_TYPE = "graphCanvas";

export type CanvasNodeData = {
  label: string;
  title?: string;
  tintClass?: string | null;
  ringClass?: string | null;
  badge?: ReactNode;
};

export type CanvasFlowNode = Node<CanvasNodeData, typeof CANVAS_NODE_TYPE>;

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 36;

export function CanvasNode({ data }: NodeProps<CanvasFlowNode>) {
  const { label, title, tintClass, ringClass, badge } = data;
  return (
    <div
      title={title ?? label}
      className={cn(
        "bg-card text-foreground relative flex h-9 items-center gap-sm rounded-md border border-border px-sm text-caption shadow-sm transition-colors",
        "hover:border-foreground/40 focus:outline-none cursor-pointer",
        tintClass,
        ringClass,
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      {/* Read-only viewer: handles are hidden but kept so xyflow can anchor edges. */}
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && <span className="shrink-0">{badge}</span>}
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </div>
  );
}
