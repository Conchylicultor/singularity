import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Website, WebsiteToolbar } from "./slots";
import { WebsitePage } from "./components/website-page";

/**
 * The landing pane — the site's index at bare `/website`. Empty segment +
 * `appPath` makes it the app's index pane. The body is the long-scroll
 * marketing page: every `Website.Section` contribution rendered top-to-bottom
 * (hero, features, demos, CTA…), then the site footer.
 */
export const landingPane = Pane.define({
  id: "website-landing",
  segment: "",
  appPath: "/website",
  chrome: { header: WebsiteToolbar },
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
