import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { breadcrumbSeparator } from "../core";

/**
 * The web half of the breadcrumb-separator region. `BreadcrumbSeparator.Variant`
 * is the slot each variant sub-plugin (chevron / slash) contributes to;
 * `breadcrumbSeparatorWeb.Region` is the host contributed into
 * `BreadcrumbSlots.Separator`.
 */
export const breadcrumbSeparatorWeb =
  defineVariantRegionWeb(breadcrumbSeparator);

export const BreadcrumbSeparator = {
  Variant: breadcrumbSeparatorWeb.Variant,
};
