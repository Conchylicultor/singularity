import { useCallback, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { removeTaskDependency, insertTaskBetween } from "@plugins/tasks/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export type InsertableEdgeData = {
  sourceTaskId: string;
  targetTaskId: string;
  targetFolderId: string | null;
  onNavigate: (taskId: string) => void;
};

type InsertableEdgeType = Edge<InsertableEdgeData, "insertable">;

export function InsertableEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<InsertableEdgeType>) {
  const [hovered, setHovered] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!data || deleting) return;
      setDeleting(true);
      try {
        await fetchEndpoint(removeTaskDependency, { id: data.targetTaskId, depId: data.sourceTaskId });
      } finally {
        setDeleting(false);
      }
    },
    [data, deleting],
  );

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!data || inserting) return;
      setInserting(true);
      try {
        const newTask = await fetchEndpoint(insertTaskBetween, {}, {
          body: {
            sourceTaskId: data.sourceTaskId,
            targetTaskId: data.targetTaskId,
            targetFolderId: data.targetFolderId,
          },
        });
        data.onNavigate(newTask.id);
      } finally {
        setInserting(false);
      }
    },
    [data, inserting],
  );

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Wider invisible hit area for hover detection */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} />
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{
            transform: `translate(-50%, -50%)`,
            left: labelX,
            top: labelY,
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms",
          }}
        >
          <button
            type="button"
            className="bg-background text-foreground hover:bg-primary hover:text-primary-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
            disabled={inserting}
            onClick={handleClick}
            aria-label="Insert task"
          >
            <Text variant="label">+</Text>
          </button>
          <button
            type="button"
            className="bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
            disabled={deleting}
            onClick={handleDelete}
            aria-label="Remove dependency"
          >
            <Text variant="label">&times;</Text>
          </button>
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
