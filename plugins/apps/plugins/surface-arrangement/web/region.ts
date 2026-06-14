import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { surfaceArrangement } from "../core";

/**
 * The web half of the surface-arrangement region. `SurfaceArrangement.Variant`
 * is the slot each variant sub-plugin (tabs/desktop) contributes to;
 * `surfaceArrangementWeb.Region` is the host contributed into
 * `Apps.SurfaceArrangement`.
 */
export const surfaceArrangementWeb = defineVariantRegionWeb(surfaceArrangement);

export const SurfaceArrangement = {
  Variant: surfaceArrangementWeb.Variant,
};
