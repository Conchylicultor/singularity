import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Timestamp } from "./timestamp";

export function TimestampAction({ event }: { event: JsonlEvent }) {
  return (
    <Timestamp
      at={event.at}
      className="tabular-nums text-[11px] text-muted-foreground"
    />
  );
}
