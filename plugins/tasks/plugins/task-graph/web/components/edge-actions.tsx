import { useCallback, useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { removeTaskDependency, insertTaskBetween } from "@plugins/tasks/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export type EdgeActionsProps = {
  sourceTaskId: string;
  targetTaskId: string;
  targetFolderId: string | null;
  onNavigate: (taskId: string) => void;
};

/**
 * The "+"/"×" buttons rendered as a graph-canvas edge `actions` overlay. The
 * primitive owns the edge path, hit area, hover reveal, and mid-edge placement;
 * this owns only the buttons and their task-domain endpoint calls.
 */
export function EdgeActions({ sourceTaskId, targetTaskId, targetFolderId, onNavigate }: EdgeActionsProps) {
  const [inserting, setInserting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleInsert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inserting) return;
      setInserting(true);
      try {
        const newTask = await fetchEndpoint(
          insertTaskBetween,
          {},
          { body: { sourceTaskId, targetTaskId, targetFolderId } },
        );
        onNavigate(newTask.id);
      } finally {
        setInserting(false);
      }
    },
    [inserting, sourceTaskId, targetTaskId, targetFolderId, onNavigate],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (deleting) return;
      setDeleting(true);
      try {
        await fetchEndpoint(removeTaskDependency, { id: targetTaskId, depId: sourceTaskId });
      } finally {
        setDeleting(false);
      }
    },
    [deleting, targetTaskId, sourceTaskId],
  );

  return (
    <>
      <button
        type="button"
        className="bg-background text-foreground hover:bg-primary hover:text-primary-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm disabled:opacity-50"
        disabled={inserting}
        onClick={handleInsert}
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
    </>
  );
}
