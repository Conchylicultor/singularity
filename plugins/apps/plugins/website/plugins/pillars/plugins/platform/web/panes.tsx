import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  WebsitePage,
  WebsiteToolbar,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsitePlatform } from "./slots";

/**
 * The Platform pillar pane at `/website/platform` — the developer-facing,
 * behind-the-scenes story: everything is a plugin. Opts into the shared site
 * header (`WebsiteToolbar`) like every website pane, and renders every
 * `WebsitePlatform.Section` contribution top-to-bottom inside `WebsitePage`
 * so the site footer renders exactly once.
 */
export const platformPane = Pane.define({
  id: "website-platform",
  segment: "platform",
  chrome: { header: WebsiteToolbar },
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
