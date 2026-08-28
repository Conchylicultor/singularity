import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BreadcrumbSlots } from "@plugins/primitives/plugins/breadcrumb/web";
import { breadcrumbSeparatorWeb } from "./region";

export { BreadcrumbSeparator } from "./region";

export default {
  description:
    "Breadcrumb-separator region (chevron / slash). Contributes its variant-region host into BreadcrumbSlots.Separator.",
  contributions: [
    ...breadcrumbSeparatorWeb.contributions,
    BreadcrumbSlots.Separator({ component: breadcrumbSeparatorWeb.Region }),
  ],
  slots: { breadcrumbSeparatorWeb: breadcrumbSeparatorWeb },
} satisfies PluginDefinition;
