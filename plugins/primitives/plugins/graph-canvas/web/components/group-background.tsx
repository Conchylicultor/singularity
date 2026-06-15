import { type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";

export const GROUP_BG_TYPE = "graphCanvasGroup";

export type GroupBgData = {
  label: string;
  /** Background + border classes (caller resolves any palette / depth). */
  className?: string | null;
  /** Classes for the corner label. */
  labelClassName?: string | null;
};

export type GroupBgFlowNode = Node<GroupBgData, typeof GROUP_BG_TYPE>;

/** Padding around the member bounding box, and the label clearance reserved on top. */
export const GROUP_PAD = 16;
export const GROUP_LABEL_HEIGHT = 18;

export function GroupBackground({ data }: NodeProps<GroupBgFlowNode>) {
  return (
    <div
      className={cn(
        "relative size-full rounded-lg border border-dashed pointer-events-none",
        data.className,
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-2 max-w-[calc(100%-16px)] truncate text-3xs font-medium",
          data.labelClassName,
        )}
      >
        {data.label}
      </span>
    </div>
  );
}
