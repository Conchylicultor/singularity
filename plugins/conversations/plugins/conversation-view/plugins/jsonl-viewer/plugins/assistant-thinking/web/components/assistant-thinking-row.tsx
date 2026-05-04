import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import { formatTime } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type AssistantThinkingEvent = Extract<JsonlEvent, { kind: "assistant-thinking" }>;

export function AssistantThinkingRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantThinkingEvent;
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className="size-3 shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined }}
        />
        <span>Thinking</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
      </button>
      {open && (
        <div className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5 border-l-2 border-muted-foreground/20 pl-3">
          {e.thinking}
        </div>
      )}
    </div>
  );
}
