import { MdCampaign } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type PrepromptEvent = Extract<JsonlEvent, { kind: "preprompt" }>;

export function PrepromptRow({ event }: { event: JsonlEvent }) {
  const e = event as PrepromptEvent;

  return (
    <CollapsibleCard
      className="border-primary/30 bg-primary/5"
      icon={<MdCampaign className="size-3.5 text-primary" />}
      label={<span className="text-primary">Instructions</span>}
    >
      <Text as="div" variant="caption" className="whitespace-pre-wrap break-words text-muted-foreground">
        {e.text}
      </Text>
    </CollapsibleCard>
  );
}
