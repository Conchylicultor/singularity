import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { MdReplay } from "react-icons/md";

type MetaPromptEvent = Extract<JsonlEvent, { kind: "meta-prompt" }>;

export function MetaPromptRow({ event }: { event: JsonlEvent }) {
  const e = event as MetaPromptEvent;
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-2xs font-medium tracking-wide text-muted-foreground">
        <MdReplay className="size-3.5" />
        <span>Resumed by harness{e.source ? ` · ${e.source}` : ""}</span>
      </div>
      <div className="whitespace-pre-wrap text-xs text-muted-foreground">
        {e.text}
      </div>
    </div>
  );
}
