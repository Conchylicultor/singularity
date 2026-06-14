import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { variantRegionServerContribution } from "@plugins/ui/plugins/variant-region/server";
import { surfaceArrangement } from "../core";

export default {
  description:
    "Surface-arrangement region (tabs / desktop). Registers the config descriptor for the Apps.SurfaceArrangement variant region.",
  contributions: [variantRegionServerContribution(surfaceArrangement)],
} satisfies ServerPluginDefinition;
