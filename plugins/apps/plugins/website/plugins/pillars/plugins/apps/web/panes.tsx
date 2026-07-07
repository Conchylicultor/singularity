import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  WebsitePage,
  WebsiteToolbar,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteApps } from "./slots";

/**
 * The Apps pillar pane at `/website/apps` — the end-user story: the real apps
 * equin ships. Opts into the shared site header (`WebsiteToolbar`) like every
 * website pane, and renders every `WebsiteApps.Section` contribution
 * top-to-bottom inside `WebsitePage` so the site footer renders exactly once.
 */
export const appsPane = Pane.define({
  id: "website-apps",
  segment: "apps",
  chrome: { header: WebsiteToolbar },
  component: AppsBody,
});

function AppsBody() {
  return (
    <PaneChrome pane={appsPane}>
      <WebsitePage>
        <WebsiteApps.Section.Render />
      </WebsitePage>
    </PaneChrome>
  );
}
