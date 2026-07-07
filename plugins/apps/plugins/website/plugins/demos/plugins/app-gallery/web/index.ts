import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { WebsiteApps } from "@plugins/apps/plugins/website/plugins/pillars/plugins/apps/web";
import { AppGallerySection } from "./components/app-gallery";

export default {
  description:
    "App-gallery demo band on the public site's Apps page: a SegmentedControl over four app vignettes (Pages, Mail, Sonata, Workflows), each genuinely interactive. Pages/Mail/Workflows are toy replicas; the Sonata vignette embeds the REAL Sonata keyboard plugin and sampled grand — the app platform, playable in the browser.",
  contributions: [
    WebsiteApps.Section({
      id: "app-gallery",
      label: "App gallery demo",
      component: AppGallerySection,
    }),
  ],
} satisfies PluginDefinition;
