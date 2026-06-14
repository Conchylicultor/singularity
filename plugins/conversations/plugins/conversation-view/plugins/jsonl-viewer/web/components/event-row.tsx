import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { JsonlViewer } from "../slots";
import { RowMarkdownProvider } from "./row-markdown-context";
import { EventActionProvider } from "../internal/event-action-context";

export function EventRow({ event, index }: { event: JsonlEvent; index: number }) {
  return (
    <EventActionProvider event={event}>
      <RowMarkdownProvider>
        <div className="group/row" data-event-index={index}>
          <JsonlViewer.EventRenderer.Dispatch event={event} />
        </div>
      </RowMarkdownProvider>
    </EventActionProvider>
  );
}
