import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Timestamp } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type SystemEvent = Extract<JsonlEvent, { kind: "system" }>;

export function SystemRow({ event }: { event: JsonlEvent }) {
  const e = event as SystemEvent;
  return (
    <div className="px-1 text-xs italic text-muted-foreground">
      <Timestamp at={e.at} className="mr-2 tabular-nums" />
      <span className="mr-2 font-mono">
        system{e.subtype ? `:${e.subtype}` : ""}
      </span>
      <span>{e.text}</span>
    </div>
  );
}
