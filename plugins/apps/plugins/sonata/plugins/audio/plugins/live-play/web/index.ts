import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { LivePlayProvider } from "./components/live-play-provider";
import { LivePlayEngine } from "./components/live-play-engine";

// The per-surface live-play API for consumers (the playable keyboard) to drive
// hand-played notes through.
export { useLivePlay, type LivePlayApi } from "./live-store";

export default {
  description:
    "Sonata live interactive player: a headless effect that turns hand-played key presses into sustaining note-on/note-off voices, routed through the engine's shared context + master gain and the default instrument.",
  contributions: [
    // Per-surface live-play store, folded above the whole Sonata subtree so the
    // engine effect and the playable keyboard (different slot branches) share
    // one store — and two open surfaces stay independent.
    Sonata.SurfaceProvider({ id: "live-play", component: LivePlayProvider }),
    // The live player lives in a headless, always-mounted effect so the voice
    // manager survives any pane/section visibility change.
    Sonata.Effect({ id: "live-play", component: LivePlayEngine }),
  ],
} satisfies PluginDefinition;
