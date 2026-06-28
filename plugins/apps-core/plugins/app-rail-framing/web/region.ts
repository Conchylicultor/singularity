import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { appRailFraming } from "../core";

/**
 * The web half of the app-rail framing region. `AppRailFraming.Variant` is the
 * slot each variant sub-plugin (rail/hidden) contributes to;
 * `appRailFramingWeb.Region` is the host contributed into `Apps.RailFraming`.
 */
export const appRailFramingWeb = defineVariantRegionWeb(appRailFraming);

export const AppRailFraming = {
  Variant: appRailFramingWeb.Variant,
};
