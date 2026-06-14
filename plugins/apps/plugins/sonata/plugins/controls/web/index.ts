import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { TransportShortcuts } from "./components/transport-shortcuts";
import { SeekHoldController } from "./seek-hold-controller";

export default {
  description:
    "Keyboard transport for Sonata: Space toggles play/pause, ↑/↓ speed up / slow down tempo, and ←/→ seek the playhead — tap to snap to the previous/next note, hold to scrub.",
  contributions: [
    // Space / ↑ / ↓ register per-surface (focus-scoped) from inside SonataProvider,
    // so each Sonata window drives only its own transport. A headless effect
    // because the registration needs `useSonata()` + the surface id in context.
    Sonata.Effect({ id: "transport-shortcuts", component: TransportShortcuts }),
    // ←/→ seek needs keyup + auto-repeat (tap vs. hold), which the keydown-only
    // shortcut registry can't express — so it runs as a headless effect, itself
    // focus- and song-gated.
    Sonata.Effect({ id: "seek-hold", component: SeekHoldController }),
  ],
} satisfies PluginDefinition;
