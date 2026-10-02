import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
  WebsiteSoon,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteVision } from "./slots";
import { VisionOpening } from "./components/vision-opening";

/**
 * The vision page at `/website/vision` — the vision for applications.
 * Wears the shared site header (`actions: WebsiteHeader`), so the wordmark and
 * every nav link follow the reader here, and renders every
 * `WebsiteVision.Section` contribution below the heading inside `WebsiteChrome`
 * so the site footer renders exactly once. Unwritten so far, so the heading is
 * followed by the site's "more details soon" note.
 */
export const visionPane = Pane.define({
  route: defineRoute({ id: "website-vision", segment: "vision" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: VisionBody,
});

function VisionBody() {
  return (
    <WebsiteChrome pane={visionPane}>
      <VisionOpening />
      <WebsiteSoon />
      <WebsiteVision.Section.Render />
    </WebsiteChrome>
  );
}
