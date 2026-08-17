import { type Node, type NodeProps } from "@xyflow/react";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import {
  cn,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export const GROUP_BG_TYPE = "graphCanvasGroup";

/**
 * The name is `bgClassName`, not `className`: this is a data carrier travelling
 * through xyflow's `node.data`, not a React prop, and a bare `className` in a
 * data position is exactly the spelling every `no-adhoc-*` class rule is blind
 * to. The compound name is what puts it in front of them.
 */
export type GroupBgData = {
  label: string;
  /** Background + border classes (caller resolves any palette / depth). */
  bgClassName?: ClassName | null;
  /** Classes for the corner label. */
  labelClassName?: ClassName | null;
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
        data.bgClassName,
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
