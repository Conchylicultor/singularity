import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { DeferredToolsDeltaView } from "./components/deferred-tools-delta-view";
import { DeferredToolsRecordView } from "./components/deferred-tools-record-view";

export default {
  collapsed: true,
  description:
    "Renders both spellings of the deferred-tool roster: the full deferred_tools_record listing and the deferred_tools_delta showing tools becoming available or removed mid-session.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "deferred_tools_delta",
      component: DeferredToolsDeltaView,
    }),
    // The same subject in its full-list form. One plugin owns both spellings so
    // "which deferred tools exist" can never grow two unrelated-looking rows.
    JsonlViewerAttachment.Renderer({
      match: "deferred_tools_record",
      component: DeferredToolsRecordView,
    }),
  ],
} satisfies PluginDefinition;
