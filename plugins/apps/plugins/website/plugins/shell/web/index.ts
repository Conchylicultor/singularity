import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { MdPublic } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { ColorPalette } from "@plugins/ui/plugins/tokens/plugins/color-palette/web";
import { Chart } from "@plugins/ui/plugins/tokens/plugins/chart/web";
import { TypeScale } from "@plugins/ui/plugins/tokens/plugins/type-scale/web";
import { Density } from "@plugins/ui/plugins/tokens/plugins/density/web";
import { Shape } from "@plugins/ui/plugins/tokens/plugins/shape/web";
import { FontFamily } from "@plugins/ui/plugins/tokens/plugins/font-family/web";
import { websiteApp } from "../core";
import { WebsiteLayout } from "./components/website-layout";
import { WebsiteWordmark } from "./components/website-wordmark";
import { WebsiteHeader, Website } from "./slots";
import { landingPane } from "./panes";
import {
  websiteColorPalette,
  websiteChart,
  websiteTypeScale,
  websiteDensity,
  websiteShape,
  websiteFontFamily,
} from "./internal/theme-presets";

export { Website, WebsiteHeader } from "./slots";
export { WebsiteNavLink } from "./components/website-nav-link";
export { WebsiteBand } from "./components/website-band";
export type { WebsiteBandRhythm } from "./components/website-band";
export { WebsiteChrome } from "./components/website-chrome";
export { landingPane } from "./panes";

export default {
  description:
    "App shell for the Website (equin public site). Registers the /website app entry, owns the shared site header (wordmark + nav) and the band/page/footer chrome every page wears, defines the Website.Section landing slot, and contributes the site's own theme presets (palette, chart ramp, type scale, density, shape, font) that the per-app token configs pin.",
  contributions: [
    Apps.App({
      app: websiteApp,
      icon: mdAppIcon(MdPublic),
      component: WebsiteLayout,
    }),
    WebsiteHeader({ id: "wordmark", component: WebsiteWordmark }),
    Pane.Register({ pane: landingPane }),
    // The site's theme — one preset per token group, pinned per app in
    // `config/ui/tokens/<group>/@app/website/config.jsonc`. Contributed by the
    // shell because the shell is the site's frame: its colour is its theme, not
    // its components.
    ColorPalette.Preset(websiteColorPalette),
    Chart.Preset(websiteChart),
    TypeScale.Preset(websiteTypeScale),
    Density.Preset(websiteDensity),
    Shape.Preset(websiteShape),
    FontFamily.Preset(websiteFontFamily),
  ],
  // `header` declares the SHARED site header, which all four pages borrow — so
  // none of them appears in its own plugin's `slots:` record, and the landing
  // pane is not declared here either. Declaring one slot under two names is what
  // the declaration pass rejects.
  slots: { ...Website, header: WebsiteHeader },
} satisfies PluginDefinition;
