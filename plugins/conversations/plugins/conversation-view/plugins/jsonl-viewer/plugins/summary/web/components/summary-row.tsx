import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

type SummaryEvent = Extract<JsonlEvent, { kind: "summary" }>;

export function SummaryRow({ event }: { event: JsonlEvent }) {
  const e = event as SummaryEvent;
  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- vertical self-margin spacing the summary separator from adjacent transcript rows; the jsonl list parent owns no per-row gap
    <Text as="div" variant="caption" className="my-2 text-muted-foreground">
      <Stack direction="row" gap="sm" align="center">
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible hairline rule flanking the centered summary label; a growing divider has no layout-primitive home */}
        <div className="h-px flex-1 bg-border" />
        <span className="font-medium">{e.text}</span>
        {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible hairline rule flanking the centered summary label; a growing divider has no layout-primitive home */}
        <div className="h-px flex-1 bg-border" />
      </Stack>
    </Text>
  );
}
