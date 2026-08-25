import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdAutoStories } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { storyApp } from "../core";
import { StoryLayout } from "./components/story-layout";
import {
  BackToStories,
  ViewSwitcherItem,
} from "./components/story-toolbar-items";
import { storyGalleryPane, storyDetailPane } from "./panes";

export default {
  description:
    "App shell for Story Builder. Registers the /story app entry and the gallery + editor panes (browse story-marked pages, author a story, switch between Author and renderer lenses).",
  contributions: [
    Apps.App({
      app: storyApp,
      icon: mdAppIcon(MdAutoStories),
      component: StoryLayout,
    }),
    // The editor pane's header: ← Stories and the view switcher. The story
    // title is the pane's own title node (`story-editor.tsx`), not an item —
    // the pane contributes exactly one `title` item into every header itself.
    // Which side of the header each lands on is the slot's reorder config, not
    // a field here.
    storyDetailPane.Actions({ id: "back", component: BackToStories }),
    storyDetailPane.Actions({
      id: "view-switcher",
      component: ViewSwitcherItem,
    }),
    Pane.Register({ pane: storyGalleryPane }),
    Pane.Register({ pane: storyDetailPane }),
  ],
  slots: {
    "story-gallery": storyGalleryPane,
    "story-detail": storyDetailPane,
  },
} satisfies PluginDefinition;
