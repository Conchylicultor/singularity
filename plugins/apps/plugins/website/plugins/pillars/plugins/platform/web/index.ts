import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { WebsiteToolbar } from "@plugins/apps/plugins/website/plugins/shell/web";
import { platformPane } from "./panes";
import { WebsitePlatform } from "./slots";
import { PlatformNavItem } from "./components/platform-nav-item";
import { PlatformHero } from "./components/platform-hero";
import { PlatformArchitecture } from "./components/platform-architecture";
import { PlatformClosing } from "./components/platform-closing";

export { platformPane } from "./panes";
export { WebsitePlatform } from "./slots";

export default {
  description:
    "Platform pillar page of the equin website: the /website/platform pane telling the developer-facing behind-the-scenes story (slots, boundaries, the plugins → apps → releases pyramid), its Platform nav link, and the WebsitePlatform.Section slot demo plugins contribute into.",
  contributions: [
    Pane.Register({ pane: platformPane }),
    WebsiteToolbar.End({ id: "platform", component: PlatformNavItem }),
    WebsitePlatform.Section({
      id: "hero",
      label: "Hero",
      component: PlatformHero,
    }),
    WebsitePlatform.Section({
      id: "architecture",
      label: "Architecture",
      component: PlatformArchitecture,
    }),
    WebsitePlatform.Section({
      id: "closing",
      label: "Closing links",
      component: PlatformClosing,
    }),
  ],
} satisfies PluginDefinition;
