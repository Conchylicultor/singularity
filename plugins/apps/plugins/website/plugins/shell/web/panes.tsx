import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "../core";
import { Website, WebsiteHeader } from "./slots";
import { WebsitePage } from "./components/website-page";

/**
 * The landing pane — the site's index at bare `/website`. `appIndex` marks it
 * as the app's index pane. It wears the shared site header rather than minting
 * one (`actions: WebsiteHeader`), like every other website pane. The body is the
 * long-scroll marketing page: every `Website.Section` contribution rendered
 * top-to-bottom (hero, features, demos, CTA…), then the site footer.
 */
export const landingPane = Pane.define({
  id: "website-landing",
  app: websiteApp,
  appIndex: true,
  actions: WebsiteHeader,
  component: LandingBody,
});

function LandingBody() {
  return (
    <PaneChrome pane={landingPane}>
      <WebsitePage>
        <Website.Section.Render />
      </WebsitePage>
    </PaneChrome>
  );
}
