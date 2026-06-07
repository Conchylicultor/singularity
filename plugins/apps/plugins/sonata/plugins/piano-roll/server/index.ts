import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { pianoRollConfig } from "../shared/config";

// Server runtime exists solely to register the piano-roll's config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  name: "Sonata: Piano Roll",
  description:
    "Server registration of the piano-roll config (Synthesia-style note-name labels).",
  contributions: [ConfigV2.Register({ descriptor: pianoRollConfig })],
} satisfies ServerPluginDefinition;
