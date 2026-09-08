import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { DirectoryListingView } from "./components/directory-listing-view";

export default {
  collapsed: true,
  description:
    "Renders the directory listings the harness hands the agent: the directory and its entry count on the collapsed line, the entry names in the body.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "directory",
      component: DirectoryListingView,
    }),
  ],
} satisfies PluginDefinition;
