import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { chordSoundConfig } from "../shared/config";

// Nothing but the config's server half. What the loop is heard with is a
// preference: there is no state to keep, no endpoint to serve, and the value
// itself lives in the config store like every other one. The piano is a browser
// AudioContext, so it has no server side at all.
export default {
  description:
    "The Chord app's piano, server side: registers the chord-sound config (the song and the piano, each on or off at its own level) so the learner's mix persists and shows in Settings.",
  contributions: [ConfigV2.Register({ descriptor: chordSoundConfig })],
} satisfies ServerPluginDefinition;
