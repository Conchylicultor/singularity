import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { JsonlViewerAttachment } from "../slots";
import type { AttachmentEvent } from "../../core";
import { GenericAttachmentView } from "./generic-attachment-view";

function resolveRenderer(
  event: AttachmentEvent,
  contributions: ReturnType<typeof JsonlViewerAttachment.Renderer.useContributions>,
) {
  const exact = contributions.find((c) => c.subtype === event.subtype);
  if (exact) return exact.component;
  return GenericAttachmentView;
}

export function AttachmentRow({ event }: { event: JsonlEvent }) {
  const e = event as AttachmentEvent;
  const contributions = JsonlViewerAttachment.Renderer.useContributions();
  const Renderer = resolveRenderer(e, contributions);
  return <Renderer event={e} />;
}
