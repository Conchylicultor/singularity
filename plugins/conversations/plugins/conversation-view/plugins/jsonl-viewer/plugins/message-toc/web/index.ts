import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { MessageToc } from "./components/message-toc";

export default {
  id: "conversation-jsonl-viewer-message-toc",
  name: "Conversation: Message TOC",
  description:
    "Floating table of contents listing user messages for quick navigation.",
  contributions: [
    JsonlViewer.Overlay({ id: "message-toc", component: MessageToc }),
  ],
} satisfies PluginDefinition;
