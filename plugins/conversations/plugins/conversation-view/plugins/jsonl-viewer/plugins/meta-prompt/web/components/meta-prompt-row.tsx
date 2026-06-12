import { MdReplay } from "react-icons/md";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type MetaPromptEvent = Extract<JsonlEvent, { kind: "meta-prompt" }>;

export function MetaPromptRow({ event }: { event: JsonlEvent }) {
  const e = event as MetaPromptEvent;

  // Sibling of the preprompt "Instructions" card on the canonical CollapsibleCard
  // chrome. Neutral (no color accent) with only a dashed border, preserving the
  // "harness, not human" cue while keeping primary as the single Instructions callout.
  return (
    <CollapsibleCard
      className="border-dashed"
      label={
        <span className="flex items-center gap-1.5">
          <MdReplay className="size-3.5" />
          Resumed by harness{e.source ? ` · ${e.source}` : ""}
        </span>
      }
    >
      <Text as="div" variant="caption" className="whitespace-pre-wrap break-words text-muted-foreground">
        {e.text}
      </Text>
    </CollapsibleCard>
  );
}
