import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { RemoteSessionView } from "./components/remote-session-view";

export default {
  collapsed: true,
  description:
    "Renders the remote_session_change attachment — the conversation became followed from claude.ai — as a one-line row linking out to the session.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "remote_session_change",
      component: RemoteSessionView,
    }),
  ],
} satisfies PluginDefinition;
