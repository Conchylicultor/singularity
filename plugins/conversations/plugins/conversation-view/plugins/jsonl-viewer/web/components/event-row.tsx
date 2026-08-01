import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { JsonlViewer } from "../slots";
import { EventActionProvider } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { eventKey } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { RowMarkdownProvider } from "./row-markdown-context";

/**
 * `data-event-key` is content identity and is what anything remembering a row
 * across time must use. `data-event-index` remains only as a positional handle
 * for same-render lookups — it is the index into the *filtered* array, so it
 * names a different row whenever the EventFilter set changes.
 */
export function EventRow({ event, index }: { event: JsonlEvent; index: number }) {
  return (
    <EventActionProvider event={event}>
      <RowMarkdownProvider>
        <div
          className={hoverRevealGroup}
          data-event-index={index}
          data-event-key={eventKey(event)}
        >
          <JsonlViewer.EventRenderer.Dispatch event={event} />
        </div>
      </RowMarkdownProvider>
    </EventActionProvider>
  );
}
