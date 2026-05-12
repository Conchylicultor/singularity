import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { JsonlViewer } from "../slots";
import { RowMarkdownProvider } from "./row-markdown-context";

function UnknownEventRow({ event }: { event: JsonlEvent }) {
  return (
    <div className="px-3 py-1.5 text-xs text-muted-foreground font-mono">
      <span className="text-yellow-500">Unknown {event.kind} event.</span>{" "}
      Payload: {JSON.stringify(event)}
    </div>
  );
}

function RowActions({ event }: { event: JsonlEvent }) {
  const actions = JsonlViewer.RowAction.useContributions();
  if (actions.length === 0) return null;
  return (
    <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md bg-background/80 px-0.5 py-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      {actions.map((a) => (
        <a.component key={a.id} event={event} />
      ))}
    </div>
  );
}

export function EventRow({ event, index }: { event: JsonlEvent; index: number }) {
  const renderers = JsonlViewer.EventRenderer.useContributions();
  const match = renderers.find((c) => c.kind === event.kind);
  return (
    <RowMarkdownProvider>
      <div className="group/row relative" data-event-index={index}>
        {match ? (
          <match.component event={event} />
        ) : (
          <UnknownEventRow event={event} />
        )}
        <RowActions event={event} />
      </div>
    </RowMarkdownProvider>
  );
}
