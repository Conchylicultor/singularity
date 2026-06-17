import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type SummaryEvent = Extract<JsonlEvent, { kind: "summary" }>;

export function SummaryRow({ event }: { event: JsonlEvent }) {
  const e = event as SummaryEvent;
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical self-margin spacing the summary separator from adjacent transcript rows; the jsonl list parent owns no per-row gap
    <Text as="div" variant="caption" className="my-2 flex items-center gap-sm text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span className="font-medium">{e.text}</span>
      <div className="h-px flex-1 bg-border" />
    </Text>
  );
}
