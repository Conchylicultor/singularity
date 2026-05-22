import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { Timestamp } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type UnknownEvent = Extract<JsonlEvent, { kind: "unknown" }>;

export function UnknownRow({ event }: { event: JsonlEvent }) {
  const e = event as UnknownEvent;
  const { open, triggerProps, contentId } = useCollapsible();

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span className="font-mono">{e.type}</span>
        <Timestamp at={e.at} className="ml-auto tabular-nums text-muted-foreground" />
      </button>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
            {JSON.stringify(e.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
