import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { websiteApp } from "../core";
import { Website } from "./slots";
import { WebsitePage } from "./components/website-page";

const landingRoute = defineRoute({
  id: "website-landing",
  segment: "",
});

/**
 * The landing pane — the site's index at bare `/website`. `appIndex` marks it
 * as the app's index pane.
 *
 * Unlike every other website pane it does NOT borrow the shared site header:
 * `actions` is omitted, so `Pane.define` mints this pane a header slot of its
 * own that nothing contributes to. The homepage therefore carries no wordmark
 * and no nav — its whole job is to state the premise and fork, and a nav row
 * would offer the same two destinations a second time, in smaller type. The
 * header lands on the two question pages, where the reader has somewhere to go
 * back to.
 *
 * What that leaves is an EMPTY header band: `PaneChrome` always paints its
 * `Bar` (there is no opt-out — a pane may never strand its own scrolling, and
 * in the floating surface mode that band is the window's drag handle), so the
 * homepage still opens with a bare strip and its hairline. Removing the strip
 * means teaching the pane primitive to paint no band for an empty header,
 * which is a change to that primitive, not to this page.
 *
 * The body is the landing page: every `Website.Section` contribution rendered
 * top-to-bottom (intro, fork), then the site footer.
 */
export const landingPane = Pane.define({
  route: landingRoute,
  app: websiteApp,
  appIndex: true,
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
