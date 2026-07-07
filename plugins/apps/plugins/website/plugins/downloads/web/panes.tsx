import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  WebsitePage,
  WebsiteToolbar,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { DownloadsPage } from "./components/downloads-page";

/**
 * The downloads pane at `/website/download`. Opts into the shared site header
 * (`WebsiteToolbar`) like every website pane, and wraps its body in
 * `WebsitePage` so the site footer renders exactly once.
 */
export const downloadsPane = Pane.define({
  id: "website-downloads",
  segment: "download",
  chrome: { header: WebsiteToolbar },
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
