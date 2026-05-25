import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { SkillListingView } from "./components/skill-listing-view";

export default {
  id: "conversation-jsonl-viewer-attachment-skill-listing",
  name: "JSONL Viewer: skill-listing attachment renderer",
  collapsed: true,
  description:
    "Renders skill-listing attachment events showing skills available in the current session.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      subtype: "skill_listing",
      component: SkillListingView,
    }),
  ],
} satisfies PluginDefinition;
