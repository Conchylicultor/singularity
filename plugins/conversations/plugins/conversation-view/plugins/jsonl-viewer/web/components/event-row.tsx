import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { JsonlViewer } from "../slots";
import { RowMarkdownProvider } from "./row-markdown-context";

function HoverActions({ event }: { event: JsonlEvent }) {
  const actions = JsonlViewer.RowAction.useContributions();
  if (actions.length === 0) return null;
  return (
    <div className="absolute right-1 top-1 z-raised flex items-center gap-xs rounded-lg px-xs py-2xs opacity-0 shadow-sm backdrop-blur-2xl transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      <JsonlViewer.RowAction.Render>
        {(item) => <item.component event={event} />}
      </JsonlViewer.RowAction.Render>
    </div>
  );
}

export function EventRow({ event, index }: { event: JsonlEvent; index: number }) {
  return (
    <RowMarkdownProvider>
      <div className="group/row relative" data-event-index={index}>
        <JsonlViewer.EventRenderer.Dispatch event={event} />
        <HoverActions event={event} />
      </div>
    </RowMarkdownProvider>
  );
}
