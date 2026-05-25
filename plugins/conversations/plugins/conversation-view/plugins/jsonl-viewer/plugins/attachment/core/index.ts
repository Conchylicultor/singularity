import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

export type AttachmentEvent = Extract<JsonlEvent, { kind: "attachment" }>;

export interface AttachmentRendererProps {
  event: AttachmentEvent;
}
