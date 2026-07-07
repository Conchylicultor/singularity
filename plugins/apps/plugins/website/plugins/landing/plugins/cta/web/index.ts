import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { CtaSection } from "./components/cta-section";

export default {
  description:
    "Landing closing CTA band: a short headline and a primary Download button that navigates to the downloads pane.",
  contributions: [
    Website.Section({ id: "cta", label: "Get started", component: CtaSection }),
  ],
} satisfies PluginDefinition;
