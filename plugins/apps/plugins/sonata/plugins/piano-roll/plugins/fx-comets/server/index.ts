import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { fxCometsConfig } from "../shared/config";

// Server runtime exists solely to register the config descriptor — config_v2
// requires registration on BOTH web (WebRegister) and server (Register).
export default {
  description: "Server registration of the fx-comets enabled toggle.",
  contributions: [ConfigV2.Register({ descriptor: fxCometsConfig })],
} satisfies ServerPluginDefinition;
