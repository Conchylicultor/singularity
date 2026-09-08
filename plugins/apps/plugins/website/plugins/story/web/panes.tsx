import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteStory } from "./slots";
import { StoryOpening } from "./components/story-opening";

/**
 * The story page at `/website/story` — where equin came from, for a reader who
 * has read the two questions and wants the context behind them.
 *
 * Wears the shared site header (`actions: WebsiteHeader`), so the wordmark and
 * every nav link follow the reader here, and renders every
 * `WebsiteStory.Section` contribution below the opening.
 */
export const storyPane = Pane.define({
  route: defineRoute({ id: "website-story", segment: "story" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: StoryBody,
});

function StoryBody() {
  return (
    <WebsiteChrome pane={storyPane}>
      <StoryOpening />
      <WebsiteStory.Section.Render />
    </WebsiteChrome>
  );
}
