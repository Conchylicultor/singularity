import { type Node, type NodeProps } from "@xyflow/react";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

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
      <Pin
        to="top-left"
        offset="xs"
        // top-1 (xs = 0.25rem) maps to offset; left-2 (sm = 0.5rem) is the asymmetric
        // horizontal inset, applied inline since Pin uses one offset for both edges.
        style={{ left: "var(--space-sm)" }}
        className="max-w-[calc(100%-16px)]"
      >
        <SingleLineProvider value={true}>
          <Text className={cn("text-3xs font-medium", data.labelClassName)}>
            {data.label}
          </Text>
        </SingleLineProvider>
      </Pin>
    </div>
  );
}
