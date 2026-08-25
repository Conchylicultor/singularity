import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsitePage,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { DownloadsPage } from "./components/downloads-page";

/**
 * The downloads pane at `/website/download`. Wears the shared site header
 * (`actions: WebsiteHeader`) like every website pane, and wraps its body in
 * `WebsitePage` so the site footer renders exactly once.
 */
export const downloadsPane = Pane.define({
  id: "website-downloads",
  app: websiteApp,
  segment: "download",
  actions: WebsiteHeader,
  component: DownloadsBody,
});

function DownloadsBody() {
  return (
    <PaneChrome pane={downloadsPane}>
      <WebsitePage>
        <DownloadsPage />
      </WebsitePage>
    </PaneChrome>
  );
}
