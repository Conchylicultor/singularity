import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { ContactSection } from "./components/contact-section";

export default {
  description:
    "Getting in touch: the homepage's closing band — two reasons to write, two cards leading to the one address the site publishes. The address itself and the source link live in the shell's site footer.",
  contributions: [
    Website.Section({
      id: "contact",
      label: "Contact",
      component: ContactSection,
    }),
  ],
} satisfies PluginDefinition;
