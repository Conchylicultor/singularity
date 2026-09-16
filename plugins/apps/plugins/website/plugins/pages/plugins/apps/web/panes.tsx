import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
  WebsiteSoon,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteApps } from "./slots";
import { AppsOpening } from "./components/apps-opening";

/**
 * The applications page at `/website/apps` — the vision for applications.
 * Wears the shared site header (`actions: WebsiteHeader`), so the wordmark and
 * every nav link follow the reader here, and renders every
 * `WebsiteApps.Section` contribution below the heading inside `WebsiteChrome`
 * so the site footer renders exactly once. Unwritten so far, so the heading is
 * followed by the site's "more details soon" note.
 */
export const appsPane = Pane.define({
  route: defineRoute({ id: "website-apps", segment: "apps" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: AppsBody,
});

function AppsBody() {
  return (
    <WebsiteChrome pane={appsPane}>
      <AppsOpening />
      <WebsiteSoon />
      <WebsiteApps.Section.Render />
    </WebsiteChrome>
  );
}
