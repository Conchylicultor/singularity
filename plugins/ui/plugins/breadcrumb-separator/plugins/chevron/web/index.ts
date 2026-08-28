import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BreadcrumbSeparator } from "@plugins/ui/plugins/breadcrumb-separator/web";
import { ChevronSeparator } from "./components/chevron-separator";

export default {
  description:
    "Chevron breadcrumb separator — a dimmed caret pointing along the path (the default).",
  contributions: [
    BreadcrumbSeparator.Variant({
      id: "chevron",
      label: "Chevron",
      match: "chevron",
      component: ChevronSeparator,
    }),
  ],
} satisfies PluginDefinition;
