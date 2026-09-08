import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { StoryLinkSection } from "./components/story-link-section";

export default {
  description:
    "Landing story-link band: the one quiet line between the fork and the contact block, offering the story page to a reader who wants the context rather than either answer.",
  contributions: [
    Website.Section({
      id: "story-link",
      label: "Story link",
      component: StoryLinkSection,
    }),
  ],
} satisfies PluginDefinition;
