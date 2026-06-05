import { MdCampaign } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";

type PrepromptEvent = Extract<JsonlEvent, { kind: "preprompt" }>;

export function PrepromptRow({ event }: { event: JsonlEvent }) {
  const e = event as PrepromptEvent;
  const { open, triggerProps, contentId } = useCollapsible();

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-xs tracking-wide text-primary/80 hover:text-primary transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <MdCampaign className="size-3.5" />
        <span>Instructions</span>
      </button>
      {open && (
        <div
          id={contentId}
          className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground leading-5 border-l-2 border-primary/20 pl-3"
        >
          {e.text}
        </div>
      )}
    </div>
  );
}
