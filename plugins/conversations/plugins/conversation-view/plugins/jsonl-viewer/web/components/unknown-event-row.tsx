import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/text/web";

export function UnknownEventRow({ event }: { event: JsonlEvent }) {
  return (
    <Text as="div" variant="caption" className="px-3 py-1.5 text-muted-foreground font-mono">
      <span className="text-warning">Unhandled {event.kind} event.</span>
    </Text>
  );
}
