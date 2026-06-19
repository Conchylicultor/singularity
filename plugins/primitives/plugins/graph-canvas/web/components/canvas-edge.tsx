import type { ReactNode } from "react";
import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export const CANVAS_EDGE_TYPE = "graphCanvasEdge";

export type CanvasEdgeData = {
  /** Hover-revealed mid-edge overlay (e.g. insert / remove buttons). */
  actions?: ReactNode;
  edgePath?: "bezier" | "smoothstep";
};

export type CanvasFlowEdge = Edge<CanvasEdgeData, typeof CANVAS_EDGE_TYPE>;

export function CanvasEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<CanvasFlowEdge>) {
  const [hovered, setHovered] = useState(false);

  const pathArgs = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [edgePath, labelX, labelY] =
    data?.edgePath === "smoothstep" ? getSmoothStepPath(pathArgs) : getBezierPath(pathArgs);

  const actions = data?.actions;
  if (actions == null) {
    return <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />;
  }

  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Wider invisible hit area for hover detection. */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} />
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <Stack
          direction="row"
          gap="xs"
          align="center"
          // eslint-disable-next-line layout/no-adhoc-layout -- absolute mid-edge label at xyflow-computed (labelX, labelY) coordinates
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            transform: "translate(-50%, -50%)",
            left: labelX,
            top: labelY,
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms",
          }}
        >
          {actions}
        </Stack>
      </EdgeLabelRenderer>
    </g>
  );
}
