import { MdCampaign } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";

type PrepromptEvent = Extract<JsonlEvent, { kind: "preprompt" }>;

export function PrepromptRow({ event }: { event: JsonlEvent }) {
  const e = event as PrepromptEvent;

  return (
    <CollapsibleCard
      tone="primary"
      label={
        <>
          <MdCampaign className="size-3.5" />
          <span>Instructions</span>
        </>
      }
    >
      <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground leading-5">
        {e.text}
      </div>
    </CollapsibleCard>
  );
}
