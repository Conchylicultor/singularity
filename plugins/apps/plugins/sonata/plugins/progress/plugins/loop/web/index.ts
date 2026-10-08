import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { SonataPlayer } from "@plugins/apps/plugins/sonata/plugins/player/web";
import { LoopRegion } from "./components/loop-region";
import { LoopRollRegion } from "./components/loop-roll-region";
import { LoopRollEdge } from "./components/loop-roll-edge";
import { LoopToggle } from "./components/loop-toggle";
import { LoopShortcuts } from "./components/loop-shortcuts";

export default {
  description:
    "Sonata A–B practice loop: a draggable loop region on the progression bar, a Loop toggle at the end of the player's transport strip, and L/[/] shortcuts that cycle playback within [A, B].",
  contributions: [
    SonataProgress.Marker({ id: "loop", component: LoopRegion }),
    Sonata.TransportOverlay({
      id: "loop",
      requires: ["time-axis"],
      component: LoopRollRegion,
    }),
    Sonata.TransportEdge({
      id: "loop",
      requires: ["time-axis"],
      component: LoopRollEdge,
    }),
    // The Loop toggle closes the transport strip, after the scrubber.
    SonataPlayer.Transport({ id: "loop-toggle", component: LoopToggle }),
    Sonata.Effect({ id: "loop-shortcuts", component: LoopShortcuts }),
  ],
} satisfies PluginDefinition;
