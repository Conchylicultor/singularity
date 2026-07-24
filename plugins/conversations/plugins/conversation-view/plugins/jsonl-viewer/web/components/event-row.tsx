import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { JsonlViewer } from "../slots";
import { EventActionProvider } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { RowMarkdownProvider } from "./row-markdown-context";

export function EventRow({ event, index }: { event: JsonlEvent; index: number }) {
  return (
    <EventActionProvider event={event}>
      <RowMarkdownProvider>
        <div className={hoverRevealGroup} data-event-index={index}>
          <JsonlViewer.EventRenderer.Dispatch event={event} />
        </div>
      </RowMarkdownProvider>
    </EventActionProvider>
  );
}
