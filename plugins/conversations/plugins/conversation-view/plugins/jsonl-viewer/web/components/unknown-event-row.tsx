import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function UnknownEventRow({ event }: { event: JsonlEvent }) {
  return (
    <Text as="div" variant="caption" className="px-md py-xs text-muted-foreground font-mono">
      <span className="text-warning">Unhandled {event.kind} event.</span>
    </Text>
  );
}
