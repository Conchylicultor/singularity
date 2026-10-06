import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataPlayer } from "@plugins/apps/plugins/sonata/plugins/player/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PlayPauseShortcut } from "./components/play-pause-shortcut";
import { TempoShortcuts } from "./components/tempo-shortcuts";
import { SeekHoldController } from "./seek-hold-controller";

export default {
  description:
    "Keyboard transport for Sonata players: Space toggles play/pause and ←/→ seek the playhead (tap to jump a bar, hold to scrub) on every shown player — the Sonata app's and a file preview's alike — and, in the Sonata app, ↑/↓ speed up / slow down the tempo. All focus-scoped per surface.",
  contributions: [
    // Space and ←/→ act on what every player shows (the play toggle, the
    // scrubber), so they mount per player while it is shown — never on the
    // library's now-playing bar.
    SonataPlayer.Effect({ id: "play-pause", component: PlayPauseShortcut }),
    // ←/→ seek needs keyup + auto-repeat (tap vs. hold), which the keydown-only
    // shortcut registry can't express — so it runs as its own listener, itself
    // focus-gated.
    SonataPlayer.Effect({ id: "seek-hold", component: SeekHoldController }),
    // ↑/↓ tempo is app-only: its control and readout live in Sonata's
    // transport bar.
    Sonata.Effect({ id: "tempo-shortcuts", component: TempoShortcuts }),
  ],
} satisfies PluginDefinition;
