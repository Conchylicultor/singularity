import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

export function UnknownEventRow({ event }: { event: JsonlEvent }) {
  return (
    <div className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
      <span className="text-warning">Unhandled {event.kind} event.</span>
    </div>
  );
}
