import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { keyboardStyleConfig } from "../shared/config";

// Server runtime exists solely to register the keyboard's style config —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  description:
    "Server registration of the keyboard style config (flat / realistic key rendering).",
  contributions: [ConfigV2.Register({ descriptor: keyboardStyleConfig })],
} satisfies ServerPluginDefinition;
