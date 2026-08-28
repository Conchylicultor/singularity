import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BreadcrumbSeparator } from "@plugins/ui/plugins/breadcrumb-separator/web";
import { SlashSeparator } from "./components/slash-separator";

export default {
  description:
    "Slash breadcrumb separator — the path spelling, dimmed so it reads as a mark rather than as a character of the words beside it.",
  contributions: [
    BreadcrumbSeparator.Variant({
      id: "slash",
      label: "Slash",
      match: "slash",
      component: SlashSeparator,
    }),
  ],
} satisfies PluginDefinition;
