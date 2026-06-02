import { useCallback, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

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
        await fetch(
          `/api/tasks/${data.targetTaskId}/dependencies/${data.sourceTaskId}`,
          { method: "DELETE" },
        );
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
        const res = await fetch("/api/tasks/insert-between", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTaskId: data.sourceTaskId,
            targetTaskId: data.targetTaskId,
            targetFolderId: data.targetFolderId,
          }),
        });
        if (!res.ok) return;
        const newTask = (await res.json()) as { id: string };

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
            <span className="text-sm font-medium leading-none">+</span>
          </button>
          <button
            type="button"
            className="bg-background text-foreground hover:bg-destructive hover:text-destructive-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
            disabled={deleting}
            onClick={handleDelete}
            aria-label="Remove dependency"
          >
            <span className="text-sm font-medium leading-none">&times;</span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
