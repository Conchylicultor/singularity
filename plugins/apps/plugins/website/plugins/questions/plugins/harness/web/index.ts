import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteHeader } from "@plugins/apps/plugins/website/plugins/shell/web";
import { harnessPane } from "./panes";
import { WebsiteHarness } from "./slots";
import { HarnessNavItem } from "./components/harness-nav-item";

export { harnessPane } from "./panes";
export { WebsiteHarness } from "./slots";

export default {
  description:
    "The engineering page of the equin website: the /website/harness pane answering 'what does software engineering look like when no human reviews the code?', its Harness nav link, and the WebsiteHarness.Section slot the answer is written into.",
  contributions: [
    // This pane BORROWS the shared site header (`actions: WebsiteHeader`), so it
    // mints no slot of its own and is deliberately absent from `slots:` — the
    // header is declared once, by `apps.website.shell`.
    Pane.Register({ pane: harnessPane }),
    WebsiteHeader({ id: "harness", component: HarnessNavItem }),
  ],
  slots: { ...WebsiteHarness },
} satisfies PluginDefinition;
