import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdAutoStories } from "react-icons/md";
import { StoryLayout } from "./components/story-layout";
import { storyGalleryPane, storyDetailPane } from "./panes";

export default {
  description:
    "App shell for Story Builder. Registers the /story app entry and the gallery + editor panes (browse story-marked pages, author a story, switch between Author and renderer lenses).",
  contributions: [
    Apps.App({
      id: "story",
      icon: MdAutoStories,
      tooltip: "Story",
      component: StoryLayout,
      path: "/story",
    }),
    Pane.Register({ pane: storyGalleryPane }),
    Pane.Register({ pane: storyDetailPane }),
  ],
} satisfies PluginDefinition;
