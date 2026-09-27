import { useEffect, useMemo } from "react";
import { useLive, useLiveRow } from "@plugins/network/plugins/live/web";
import {
  DEFAULT_TASK_TRACK,
  type StoredTaskTrack,
  type TaskTrack,
} from "../core";
import { taskTracks } from "../shared/resources";

/** One task's track: not known yet, or the track. */
export type TaskTrackResult =
  { pending: true } | { pending: false; track: TaskTrack };

/**
 * The task's track: its row of the `taskTracks` point sibling. `found: false`
 * is determinately the default track (main); "not loaded yet" stays the
 * pending arm, so a sidequest can never flash as main.
 */
export function useTaskTrack(taskId: string): TaskTrackResult {
  const result = useLiveRow(taskTracks, taskId);
  if (result.pending) return { pending: true };
  return {
    pending: false,
    track: result.found ? result.row.track : DEFAULT_TASK_TRACK,
  };
}

/** Every stored (non-main) track: not known yet, or taskId → track. */
export type StoredTracks =
  | { pending: true }
  | { pending: false; tracks: ReadonlyMap<string, StoredTaskTrack> };

/**
 * The stored tracks of the bounded `taskTracks` window, for a surface that
 * needs a track for EVERY task (the task list's field). A task missing from
 * the map is main. The window grows while it is full (up to its `maxLimit`),
 * so the map holds every sidequest until that boundary — see
 * `shared/resources.ts`.
 */
export function useStoredTracks(): StoredTracks {
  const result = useLive(taskTracks);
  const grow =
    !result.pending && result.canGrow && !result.growing
      ? result.loadMore
      : null;
  useEffect(() => {
    grow?.();
  }, [grow]);
  return useMemo(() => {
    if (result.pending) return { pending: true };
    return {
      pending: false,
      tracks: new Map(result.data.map((r) => [r.taskId, r.track])),
    };
  }, [result]);
}
