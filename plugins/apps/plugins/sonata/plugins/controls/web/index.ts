import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { transportShortcuts } from "./shortcuts";
import { SeekHoldController } from "./seek-hold-controller";

export default {
  description:
    "Keyboard transport for Sonata: Space toggles play/pause, ↑/↓ speed up / slow down tempo, and ←/→ seek the playhead — tap to snap to the previous/next note, hold to scrub.",
  contributions: [
    ...transportShortcuts,
    // ←/→ seek needs keyup + auto-repeat (tap vs. hold), which the keydown-only
    // shortcut registry can't express — so it runs as a headless effect.
    Sonata.Effect({ id: "seek-hold", component: SeekHoldController }),
  ],
} satisfies PluginDefinition;
