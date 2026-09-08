import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { DateAttachmentView } from "./components/date-attachment-view";

export default {
  collapsed: true,
  description:
    "Renders the harness calendar-date attachments — the routine date stamp and the mid-conversation date change — across both the current `date` spelling and the legacy `date_change` one.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "date",
      component: DateAttachmentView,
    }),
    // The pre-2.1.260 spelling of the same fact: `{ type: "date_change",
    // newDate }` is the `changed: true` case, and old transcripts keep it
    // forever. Same component, so the two can never drift apart.
    JsonlViewerAttachment.Renderer({
      match: "date_change",
      component: DateAttachmentView,
    }),
  ],
} satisfies PluginDefinition;
