import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdAutoStories } from "react-icons/md";
import { StoryLayout } from "./components/story-layout";
import { StoryToolbar } from "./toolbar";
import {
  BackToStories,
  StoryTitleItem,
  ViewSwitcherItem,
} from "./components/story-toolbar-items";
import { storyGalleryPane, storyDetailPane } from "./panes";

export { StoryToolbar } from "./toolbar";

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
    // Editor toolbar zones: Start (← Stories, title) + End (view switcher).
    StoryToolbar.Start({ id: "back", component: BackToStories }),
    StoryToolbar.Start({ id: "title", component: StoryTitleItem }),
    StoryToolbar.End({ id: "view-switcher", component: ViewSwitcherItem }),
    Pane.Register({ pane: storyGalleryPane }),
    Pane.Register({ pane: storyDetailPane }),
  ],
} satisfies PluginDefinition;
