import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
  WebsiteSoon,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteFoundations } from "./slots";
import { FoundationsOpening } from "./components/foundations-opening";

/**
 * The foundations page at `/website/foundations` — how equin is built.
 * Wears the shared site header (`actions: WebsiteHeader`), and renders every
 * `WebsiteFoundations.Section` contribution below the heading inside
 * `WebsiteChrome` so the site footer renders exactly once. Unwritten so far, so
 * the heading is followed by the site's "more details soon" note.
 */
export const foundationsPane = Pane.define({
  route: defineRoute({ id: "website-foundations", segment: "foundations" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: FoundationsBody,
});

function FoundationsBody() {
  return (
    <WebsiteChrome pane={foundationsPane}>
      <FoundationsOpening />
      <WebsiteSoon />
      <WebsiteFoundations.Section.Render />
    </WebsiteChrome>
  );
}
