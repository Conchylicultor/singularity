import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { websiteApp } from "@plugins/apps/plugins/website/plugins/shell/core";
import {
  WebsiteChrome,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { WebsiteHarness } from "./slots";
import { HarnessQuestion } from "./components/harness-question";

/**
 * The engineering page at `/website/harness` — the right fork of the homepage.
 * Wears the shared site header (`actions: WebsiteHeader`), so the wordmark and
 * both nav links follow the reader here, and renders every
 * `WebsiteHarness.Section` contribution below the question inside `WebsiteChrome`
 * so the site footer renders exactly once.
 */
export const harnessPane = Pane.define({
  route: defineRoute({ id: "website-harness", segment: "harness" }),
  app: websiteApp,
  actions: WebsiteHeader,
  component: HarnessBody,
});

function HarnessBody() {
  return (
    <WebsiteChrome pane={harnessPane}>
      <HarnessQuestion />
      <WebsiteHarness.Section.Render />
    </WebsiteChrome>
  );
}
