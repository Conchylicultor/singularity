import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

type AssistantTextEvent = Extract<JsonlEvent, { kind: "assistant-text" }>;

export function StopReasonAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "assistant-text") return null;
  const e = event as AssistantTextEvent;
  if (!e.stopReason) return null;
  return (
    <span className="text-2xs text-muted-foreground/70">
      {e.stopReason}
    </span>
  );
}
