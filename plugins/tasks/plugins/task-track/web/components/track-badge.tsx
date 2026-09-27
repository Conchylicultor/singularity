import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { TRACK_META, type TaskTrack } from "../../core";

/** The one track badge: a tinted chip reading "Main" / "Sidequest". */
export function TrackBadge({ track }: { track: TaskTrack }) {
  const meta = TRACK_META[track];
  return (
    <Badge variant={meta.variant} title={meta.hint}>
      {meta.label}
    </Badge>
  );
}
