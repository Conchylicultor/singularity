import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Story } from "@plugins/apps/plugins/story/plugins/render/web";
import { TextContent } from "./components/text-content";

export default {
  description: "Renders the text block payload as a Story.Content widget.",
  contributions: [Story.Content({ match: "text", component: TextContent })],
} satisfies PluginDefinition;
