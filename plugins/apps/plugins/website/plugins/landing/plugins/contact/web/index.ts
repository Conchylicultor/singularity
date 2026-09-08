import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Website,
  WebsiteHeader,
} from "@plugins/apps/plugins/website/plugins/shell/web";
import { ContactSection } from "./components/contact-section";
import { ContactNavItem } from "./components/contact-nav-item";

export default {
  description:
    "Getting in touch: the homepage's closing band (two reasons to write, plus the GitHub and email links) and the 'Get in touch' call to action in the shared site header. Owns the one address the site publishes.",
  contributions: [
    Website.Section({
      id: "contact",
      label: "Contact",
      component: ContactSection,
    }),
    WebsiteHeader({ id: "contact", component: ContactNavItem }),
  ],
} satisfies PluginDefinition;
