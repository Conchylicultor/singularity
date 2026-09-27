import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { DEFAULT_TASK_TRACK, TASK_TRACKS, TRACK_META } from "../../core";
import { useStoredTracks } from "../hooks";
import { TrackBadge } from "./track-badge";

const TRACK_OPTIONS = TASK_TRACKS.map((track) => ({
  value: track,
  label: TRACK_META[track].label,
  variant: TRACK_META[track].variant,
  hint: TRACK_META[track].hint,
}));

/**
 * Field extension contributed into the task list's `Tasks.Fields`: one `track`
 * enum field whose cell is the track badge, so every row shows its track, and
 * which the tasks DataView can group and filter by (`enum` + `value`).
 *
 * While the tracks are not known yet the value is `null` and the cell the
 * loading block — never "main", which would be a claim about the task that
 * then reverses. The window is preloaded, so this is at most one round-trip.
 */
export function TrackField({ render }: FieldExtensionProps<TaskListItem>) {
  const stored = useStoredTracks();
  const fields = useMemo<FieldDef<TaskListItem>[]>(() => {
    const trackOf = (t: TaskListItem) =>
      stored.pending ? null : (stored.tracks.get(t.id) ?? DEFAULT_TASK_TRACK);
    return [
      {
        id: "track",
        label: "Track",
        type: "enum",
        align: "end",
        options: TRACK_OPTIONS,
        value: trackOf,
        cell: (t) => {
          const track = trackOf(t);
          return track === null ? (
            <Loading variant="block" className="h-4 w-12" />
          ) : (
            <TrackBadge track={track} />
          );
        },
        // A grouping/filter dimension, not searchable text: kept out of the
        // full-text search accessor, still in the Filter pill.
        filterable: false,
      },
    ];
  }, [stored]);
  return <>{render(fields)}</>;
}
