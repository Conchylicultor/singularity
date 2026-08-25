import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsitePage,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteApps } from "./slots";

/**
 * The Apps pillar pane at `/website/apps` — the end-user story: the real apps
 * equin ships. Wears the shared site header (`actions: WebsiteHeader`) like every
 * website pane, and renders every `WebsiteApps.Section` contribution
 * top-to-bottom inside `WebsitePage` so the site footer renders exactly once.
 */
export const appsPane = Pane.define({
  id: "website-apps",
  app: websiteApp,
  segment: "apps",
  actions: WebsiteHeader,
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
