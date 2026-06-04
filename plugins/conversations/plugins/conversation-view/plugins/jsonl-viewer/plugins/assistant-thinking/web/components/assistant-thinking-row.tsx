import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";

type AssistantThinkingEvent = Extract<JsonlEvent, { kind: "assistant-thinking" }>;

export function AssistantThinkingRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantThinkingEvent;
  const { open, triggerProps, contentId } = useCollapsible();

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span>Thinking</span>
      </button>
      {open && (
        <div
          id={contentId}
          className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5 border-l-2 border-muted-foreground/20 pl-3"
        >
          {e.thinking}
        </div>
      )}
    </div>
  );
}
