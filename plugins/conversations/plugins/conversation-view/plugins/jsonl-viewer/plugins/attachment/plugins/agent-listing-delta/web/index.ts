import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { AgentListingDeltaView } from "./components/agent-listing-delta-view";

export default {
  collapsed: true,
  description:
    "Renders agent-listing-delta attachment events showing which agent types are available (or added/removed) for the Agent tool.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "agent_listing_delta",
      component: AgentListingDeltaView,
    }),
  ],
} satisfies PluginDefinition;
