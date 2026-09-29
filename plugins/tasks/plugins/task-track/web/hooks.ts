import { useEffect, useMemo } from "react";
import { mapRow, useLive, useLiveRow } from "@plugins/network/plugins/live/web";
import {
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  DEFAULT_TASK_TRACK,
  type StoredTaskTrack,
  type TaskTrack,
} from "../core";
import { taskTracks } from "../shared/resources";

/** One task's track: a read — loading, failed, or the track. */
export type TaskTrackResult = ResourceResult<TaskTrack>;

/**
 * The task's track: its row of the `taskTracks` point sibling. `found: false`
 * is determinately the default track (main); "not loaded yet" stays the
 * loading arm, so a sidequest can never flash as main.
 */
export function useTaskTrack(taskId: string): TaskTrackResult {
  const result = useLiveRow(taskTracks, taskId);
  return useMemo(
    () => mapRow(result, (row) => (row ? row.track : DEFAULT_TASK_TRACK)),
    [result],
  );
}

/** Every stored (non-main) track: a read of taskId → track. */
export type StoredTracks = ResourceResult<ReadonlyMap<string, StoredTaskTrack>>;

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
    result.status === "ready" && result.canGrow && !result.growing
      ? result.loadMore
      : null;
  useEffect(() => {
    grow?.();
  }, [grow]);
  return useMemo(
    () =>
      mapResource(
        result,
        (rows) => new Map(rows.map((r) => [r.taskId, r.track])),
      ),
    [result],
  );
}
