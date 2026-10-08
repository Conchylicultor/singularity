import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { chordChartConfig } from "../shared/config";

// Server runtime exists solely to register the chord grid's config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  description:
    "Server registration of the Sonata chord grid config (lyrics under bars).",
  contributions: [ConfigV2.Register({ descriptor: chordChartConfig })],
} satisfies ServerPluginDefinition;
