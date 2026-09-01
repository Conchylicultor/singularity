import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsitePage,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteApps } from "./slots";
import { AppsQuestion } from "./components/apps-question";

/**
 * The applications page at `/website/apps` — the left fork of the homepage.
 * Wears the shared site header (`actions: WebsiteHeader`), so the wordmark and
 * both nav links follow the reader here, and renders every
 * `WebsiteApps.Section` contribution below the question inside `WebsitePage`
 * so the site footer renders exactly once.
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
        <AppsQuestion />
        <WebsiteApps.Section.Render />
      </WebsitePage>
    </PaneChrome>
  );
}
