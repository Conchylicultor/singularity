import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/text/web";

type SummaryEvent = Extract<JsonlEvent, { kind: "summary" }>;

export function SummaryRow({ event }: { event: JsonlEvent }) {
  const e = event as SummaryEvent;
  return (
    <Text as="div" variant="caption" className="my-2 flex items-center gap-2 text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="font-medium">{e.text}</span>
      <div className="h-px flex-1 bg-border" />
    </Text>
  );
}
