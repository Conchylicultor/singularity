import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Text } from "@plugins/primitives/plugins/text/web";

type SystemEvent = Extract<JsonlEvent, { kind: "system" }>;

export function SystemRow({ event }: { event: JsonlEvent }) {
  const e = event as SystemEvent;
  return (
    <Text as="div" variant="caption" className="px-1 italic text-muted-foreground">
      <span className="mr-2 font-mono">
        system{e.subtype ? `:${e.subtype}` : ""}
      </span>
      <span>{e.text}</span>
    </Text>
  );
}
