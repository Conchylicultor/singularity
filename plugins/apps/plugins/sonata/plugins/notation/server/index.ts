import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { notationConfig } from "../shared/config";

// Server runtime exists solely to register the notation's config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  description:
    "Server registration of the notation config (chord-symbol toggle + treble/bass split pitch).",
  contributions: [ConfigV2.Register({ descriptor: notationConfig })],
} satisfies ServerPluginDefinition;
