import type { ReactNode } from "react";
import { useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

export const CANVAS_NODE_TYPE = "graphCanvas";

export type CanvasNodeData = {
  label: string;
  title?: string;
  tintClass?: string | null;
  ringClass?: string | null;
  /** Extra classes on the truncating label span (e.g. `italic line-through`). */
  labelClassName?: string | null;
  /** Shrink-0 content rendered before the label (e.g. a status icon). */
  leading?: ReactNode;
  badge?: ReactNode;
  /** Hover-revealed corner overlay (e.g. a delete button). */
  actions?: ReactNode;
  /** Opt this node into visible, draggable connect handles (editor mode). */
  connectable?: boolean;
};

export type CanvasFlowNode = Node<CanvasNodeData, typeof CANVAS_NODE_TYPE>;

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 36;

const EDITOR_HANDLE_CLASS = "!bg-muted-foreground/60 !border-border !w-2.5 !h-2.5 !rounded-full";

export function CanvasNode({ data }: NodeProps<CanvasFlowNode>) {
  const { label, title, tintClass, ringClass, labelClassName, leading, badge, actions, connectable } =
    data;
  const [hovered, setHovered] = useState(false);

  // Connectable handles are visible on hover; otherwise handles stay hidden but
  // mounted so xyflow can still anchor edges (read-only viewer default).
  const handleStyle = connectable
    ? { opacity: hovered ? 1 : 0, transition: "opacity 150ms", cursor: "crosshair" }
    : undefined;

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={connectable ? EDITOR_HANDLE_CLASS : "!opacity-0"}
        isConnectable={connectable ?? false}
        style={handleStyle}
      />
      {leading != null && <span className="shrink-0">{leading}</span>}
      <span className={cn("min-w-0 flex-1 truncate", labelClassName)}>{label}</span>
      {badge != null && <span className="shrink-0">{badge}</span>}
      <Handle
        type="source"
        position={Position.Right}
        className={connectable ? EDITOR_HANDLE_CLASS : "!opacity-0"}
        isConnectable={connectable ?? false}
        style={handleStyle}
      />
      {actions != null && (
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- corner action overlay at fixed -8px pixel offset (off the spacing ramp; not a Pin anchor)
          className="nodrag nopan pointer-events-auto absolute"
          style={{ top: -8, right: -8, opacity: hovered ? 1 : 0, transition: "opacity 150ms" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
