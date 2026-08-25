import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsitePage,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsitePlatform } from "./slots";

/**
 * The Platform pillar pane at `/website/platform` — the developer-facing,
 * behind-the-scenes story: everything is a plugin. Wears the shared site
 * header (`actions: WebsiteHeader`) like every website pane, and renders every
 * `WebsitePlatform.Section` contribution top-to-bottom inside `WebsitePage`
 * so the site footer renders exactly once.
 */
export const platformPane = Pane.define({
  id: "website-platform",
  app: websiteApp,
  segment: "platform",
  actions: WebsiteHeader,
  component: PlatformBody,
});

function PlatformBody() {
  return (
    <PaneChrome pane={platformPane}>
      <WebsitePage>
        <WebsitePlatform.Section.Render />
      </WebsitePage>
    </PaneChrome>
  );
}
