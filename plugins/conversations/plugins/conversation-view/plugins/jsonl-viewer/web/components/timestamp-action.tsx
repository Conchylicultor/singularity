import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { formatTime } from "../utils";

export function TimestampAction({ event }: { event: JsonlEvent }) {
  return (
    <span className="tabular-nums text-[11px] text-muted-foreground">
      {formatTime(event.at)}
    </span>
  );
}
