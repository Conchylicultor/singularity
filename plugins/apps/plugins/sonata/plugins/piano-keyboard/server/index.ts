import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { pianoKeyboardConfig } from "../shared/config";

// Server runtime exists solely to register the keyboard's config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  name: "Sonata: Piano Keyboard",
  description:
    "Server registration of the piano-keyboard config (key-label scope).",
  contributions: [ConfigV2.Register({ descriptor: pianoKeyboardConfig })],
} satisfies ServerPluginDefinition;
